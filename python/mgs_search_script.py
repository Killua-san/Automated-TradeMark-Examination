# python/mgs_search_script.py
import sys
import asyncio
import time
import re
import json
import os
# import argparse # No longer using argparse for this script
from typing import List, Tuple, Optional, Dict

from playwright.async_api import async_playwright

# Global configuration
CONCURRENT_LIMIT = 20
search_cache: Dict[str, str] = {}
CANCELLATION_FILE = "cancel_search.tmp" # File to signal cancellation
MGS_BASE_URL = "https://webaccess.wipo.int/mgs/"
DEBUG_LOG_FILE = "mgs_search_debug.log" # Path to debug log file

def normalize_text(text: str) -> str:
    """Normalize text for comparison by removing special characters and extra spaces."""
    # Convert to lowercase
    text = text.lower()
    # Replace multiple spaces with single space
    text = re.sub(r'\s+', ' ', text)
    # Remove special characters but keep spaces
    text = re.sub(r'[^\w\s]', '', text)
    # Remove leading/trailing whitespace
    text = text.strip()
    return text

async def wait_for_results_update(page) -> None:
    await page.wait_for_function(
        "document.querySelector('span.page-results') && document.querySelector('span.page-results').textContent.trim() !== ''",
        timeout=0
    )

async def search_mgs_term(term: str, context, cancel_event: asyncio.Event, semaphore: asyncio.Semaphore, nice_filter: bool) -> Tuple[str, str]:
    """Searches for a term in the Madrid Goods & Services Manager (MGS) with debugging."""
    if cancel_event.is_set() or os.path.exists(CANCELLATION_FILE):
        return term, "Cancelled"

    async with semaphore:
        page = await context.new_page()
        try:
            # sys.stderr.write(f"DEBUG: Searching MGS for term: '{term}' with NICE filter: {nice_filter}\n") # Removed debug message
            
            await page.goto(MGS_BASE_URL, wait_until="networkidle", timeout=0)
            await page.click('xpath=//input[@id="btnSearch"]')
            await page.wait_for_selector("input#searchInputBox.dummyClass", timeout=30000)
            
            # Enter search term
            await page.fill("input#searchInputBox.dummyClass", term)
            
            # Wait for search term to be set - Fixed function call syntax
            js_code = """
            (term) => {
                const input = document.querySelector('input#searchInputBox.dummyClass');
                return input && input.value === term;
            }
            """
            await page.wait_for_function(js_code, arg=term)
            
            # Handle NICE filter
            if nice_filter:
                await page.check('input#checkNiceFilterSearch')
            else:
                await page.uncheck('input#checkNiceFilterSearch')
            
            # Click search and wait for results
            await page.click('span#searchButton')
            await page.wait_for_selector('div#divHitList', timeout=30000)
            
            # Additional wait for results to load - Fixed function call syntax
            try:
                js_code = """
                () => {
                    const hitList = document.querySelector('div#divHitList');
                    return hitList && hitList.children.length > 0;
                }
                """
                await page.wait_for_function(js_code)
            except Exception as e:
                # sys.stderr.write(f"DEBUG: Timeout waiting for results: {str(e)}\n") # Removed debug message
                pass # Allow to proceed and check for no results banner

            # --- Construct Structured Result ---
            source_name = f"mgs-nice-{'on' if nice_filter else 'off'}"
            result_data = {
                "type": "result",
                "term": term,
                "source": source_name,
                "matchType": "none", # Default to none
                "classNumber": None,
                "statusText": f"No match found (NICE {'On' if nice_filter else 'Off'})" # Default status
            }

            # Check for no results banner first
            no_results = await page.query_selector('div#divHitList > div#hitListBanner:has-text("No results")')
            if no_results:
                # Keep default result_data (matchType: none)
                pass
            else:
                # Look for matches in results list
                results_list = await page.query_selector('div#divHitList > ul')
                if results_list:
                    list_items = await results_list.query_selector_all('li')
                    normalized_search_term = normalize_text(term)
                    found_match = False # Flag to stop after first match

                    for item in list_items:
                        if found_match: break # Process only the first relevant match

                        cls_attr = await item.get_attribute('cls')  # Get the class number
                        class_badge = await item.query_selector('span.classBadge')
                        full_text = await item.text_content()

                        if class_badge:
                            badge_text = await class_badge.text_content()
                            description_text = full_text.replace(badge_text, '').strip()
                        else:
                            description_text = full_text.strip()

                        normalized_description = normalize_text(description_text)

                        # Check for exact match
                        if normalized_search_term == normalized_description:
                            result_data["matchType"] = "full"
                            result_data["classNumber"] = cls_attr
                            result_data["statusText"] = f"Full match found (Class {cls_attr}) (NICE {'On' if nice_filter else 'Off'})"
                            found_match = True
                        # Check if search term is contained within description (Treat as partial)
                        elif normalized_search_term in normalized_description:
                            result_data["matchType"] = "partial"
                            result_data["classNumber"] = cls_attr
                            result_data["statusText"] = f"Partial match found (Class {cls_attr}) (NICE {'On' if nice_filter else 'Off'})"
                            found_match = True
                    # If loop finishes without finding any match, result_data remains 'none'

            # Return the structured data object
            return result_data

        except Exception as e:
            error_message = str(e)
            sys.stderr.write(f"ERROR: Error in search_mgs_term for '{term}' (NICE {'On' if nice_filter else 'Off'}): {error_message}\n")
            # Return structured error object
            return {
                "type": "error",
                "term": term,
                "source": f"mgs-nice-{'on' if nice_filter else 'off'}",
                "message": f"Error searching MGS: {error_message}"
            }
        finally:
            await page.close()

# Modified to accept a list of task dictionaries
async def run_mgs_searches(mgs_tasks: List[Dict]):
    # sys.stderr.write("DEBUG: MGS SEARCH SCRIPT STARTED\n") # Removed debug message
    mgs_base_url = "https://webaccess.wipo.int/mgs/"
    cancel_event = asyncio.Event()
    semaphore = asyncio.Semaphore(CONCURRENT_LIMIT)
    results = {}
    start_time = time.time()

    if os.path.exists(DEBUG_LOG_FILE): # Clear log file at start of each search
        os.remove(DEBUG_LOG_FILE)

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()

            tasks = []
            # Create tasks based on the specific needs defined in mgs_tasks
            for task_info in mgs_tasks:
                term = task_info.get("term")
                needs_nice_on = task_info.get("needsNiceOn", False)
                needs_nice_off = task_info.get("needsNiceOff", False)

                if needs_nice_off:
                    tasks.append(asyncio.create_task(search_mgs_term(term, context, cancel_event, semaphore, nice_filter=False)))
                if needs_nice_on:
                    tasks.append(asyncio.create_task(search_mgs_term(term, context, cancel_event, semaphore, nice_filter=True)))

            completed_count = 0
            total_tasks = len(tasks) # Total number of actual searches to perform

            if total_tasks == 0: # Handle case where no tasks were generated
                 await context.close()
                 await browser.close()
                 elapsed_time = time.time() - start_time
                 print(json.dumps({"type": "mgs-search-time", "value": f"{elapsed_time:.2f} seconds"}))
                 return {} # Return empty results if no tasks

            for task in asyncio.as_completed(tasks):
                if os.path.exists(CANCELLATION_FILE):
                    break
                try:
                    # The task now returns a structured result object (or error object)
                    result_obj = await task

                    # Print the structured result/error object directly
                    print(json.dumps(result_obj))

                    # Update progress (only count non-error results for progress?)
                    if result_obj.get("type") != "error":
                         completed_count += 1
                         progress_percent = int((completed_count / total_tasks) * 100) if total_tasks > 0 else 100
                         print(json.dumps({"type": "progress", "value": progress_percent}))

                except asyncio.CancelledError:
                    # If a task is cancelled, we don't know the term easily here.
                    # The main process handles cancellation signal.
                    # We could potentially try to find the cancelled task's details, but skip for now.
                    sys.stderr.write("DEBUG: An MGS search task was cancelled.\n")
                    # Optionally print a generic cancellation message
                    # print(json.dumps({"type": "result", "source": "mgs", "matchType": "cancelled", "statusText": "Cancelled"}))
                except Exception as e:
                    # This catches errors during task execution/awaiting if not caught inside search_mgs_term
                    error_message = str(e)
                    sys.stderr.write(f"ERROR: Unexpected error processing MGS task result: {error_message}\n")
                    # Print a generic error message
                    print(json.dumps({"type": "error", "source": "mgs", "message": error_message}))


            await context.close()
            await browser.close()

    except Exception as e:
        error_message = str(e)
        print(json.dumps({"type": "error", "message": error_message}))

    elapsed_time = time.time() - start_time
    # Send final time report, include source
    print(json.dumps({"type": "search_time", "source": "mgs", "value": f"{elapsed_time:.2f} seconds"}))
    # The function doesn't need to return results as they are printed directly
    # return results

if __name__ == "__main__":
    # No command-line arguments expected for MGS search anymore,
    # as data comes via environment variable.
    if len(sys.argv) > 1:
         sys.stderr.write(f"ERROR: Unexpected command-line arguments received: {sys.argv[1:]}\n")
         sys.stderr.write("ERROR: Expected invocation: python mgs_search_script.py (with MGS_TASKS_JSON env var set)\n")
         sys.exit(1)

    if os.path.exists(CANCELLATION_FILE):
        os.remove(CANCELLATION_FILE)

    # Read JSON task list from environment variable
    try:
        json_input = os.environ.get('MGS_TASKS_JSON')
        # sys.stderr.write(f"DEBUG: Read from MGS_TASKS_JSON env var: {json_input[:100]}...\n") # Optional debug log
        if not json_input:
             raise ValueError("MGS_TASKS_JSON environment variable not found or is empty.")
        mgs_tasks_input = json.loads(json_input)
        if not isinstance(mgs_tasks_input, list):
             raise ValueError("Input from MGS_TASKS_JSON must be a JSON list of tasks.")
        # Optional: Add validation for each task object structure if needed
    except json.JSONDecodeError:
        # Keep error messages for actual errors
        sys.stderr.write("ERROR: Invalid JSON input received.\n")
        sys.exit(1)
    except ValueError as e:
        # Keep error messages for actual errors
        sys.stderr.write(f"ERROR: {e}\n")
        sys.exit(1)

    asyncio.run(run_mgs_searches(mgs_tasks_input))
