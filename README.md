# Automated TradeMark Examination Tool

**Status: This project is currently under development.**

## Overview

The Automated TradeMark Examination Tool is an Electron-based desktop application designed to assist with trademark examination processes. It integrates various technologies to provide functionalities such as searching trademark databases, managing results, and leveraging AI for suggestions and analysis.

The primary goal of this tool is to streamline and enhance the efficiency of trademark searches and preliminary examination tasks.

## Core Technologies

*   **Electron:** For building the cross-platform desktop application.
*   **React:** For building the user interface.
*   **Python:** Used for backend scripting, for search operations (USPTO, MGS) and AI-powered suggestions.
*   **AWS Cognito:** For user authentication and management.
*   **AWS API Gateway & Lambda (implied):** For backend API interactions, connecting to services like DynamoDB for storing match data.
*   **Gemini AI:** Integrated for formatting input and potentially providing other AI-driven insights.

## Features (Current & Planned)

*   **User Authentication:** Secure login and sign-up functionality via AWS Cognito.
*   **Trademark Search:**
    *   Search USPTO (United States Patent and Trademark Office) database.
    *   Search MGS (Manual of Goods and Services) database.
*   **Results Management:** Display and manage search results.
*   **AI-Powered Assistance:**
    *   Input formatting using Gemini AI.
    *   AI-driven suggestions for search terms.
    *   Vagueness checks for trademark terms.
*   **Data Storage:** Store and retrieve search match data (via DynamoDB).
*   **Export Functionality:** Export search results (e.g., vague results to Word documents).
*   **Auto-Updater:** Keeps the application up-to-date.

## How to Use (Development Setup)

This section outlines the general steps to get the application running in a development environment.

### Prerequisites

*   Node.js and npm
*   Python (ensure it's added to your PATH)
*   Git

### Setup Steps

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/Killua-san/Automated-TradeMark-Examination.git
    cd Automated-TradeMark-Examination
    ```

2.  **Install Root Dependencies (if any):**
    *   The main project might have its own `package.json`. If so:
        ```bash
        npm install
        ```

3.  **Install Electron App Dependencies:**
    ```bash
    cd electron
    npm install
    ```

4.  **Set Up Environment Variables:**
    *   Navigate to the `electron` directory.
    *   Create a `.env` file (`electron/.env`).
    *   Populate it with the necessary AWS Cognito, API Gateway, and Gemini API Key credentials:
        ```env
        REACT_APP_COGNITO_USER_POOL_ID=your_user_pool_id
        REACT_APP_COGNITO_CLIENT_ID=your_client_id
        REACT_APP_COGNITO_REGION=your_aws_region
        REACT_APP_API_BASE_URL=your_api_gateway_base_url
        GEMINI_API_KEY=your_gemini_api_key
        ```
    *   Replace `your_...` with your actual credential values.
    *   **Note:** The `.env` file is included in `.gitignore` and should not be committed.

5.  **Install Python Dependencies:**
    *   Navigate to the `python` directory:
        ```bash
        cd ../python 
        ```
    *   It's highly recommended to use a virtual environment:
        ```bash
        python -m venv .venv
        source .venv/bin/activate  # On Windows: .venv\Scripts\activate
        ```
    *   Install Python packages (assuming a `requirements.txt` file exists or will be created):
        ```bash
        pip install -r requirements.txt 
        ```
        *(If `requirements.txt` is not present, dependencies might need to be identified and installed manually or from the scripts).*

6.  **Run the Application (Development Mode):**
    *   The Electron application typically has a start script. From the `electron` directory:
        ```bash
        npm start 
        ```
    *   This usually starts the Webpack dev server for the React frontend and then launches the Electron main process. The Electron main process itself might be started by a separate command or configured in `electron/package.json` (e.g., using `electron .`). Refer to `electron/package.json` for specific scripts.

## Development Notes

*   The application is structured with an Electron main process (`electron/main.js`) and a React-based renderer process (`electron/src/`).
*   Python scripts in the `python/` directory handle backend tasks like database searches and AI interactions.
*   Configuration for AWS services is managed via environment variables loaded from `electron/.env`.
*   Ensure your Python environment and any necessary API keys (like Gemini) are correctly set up for full functionality.

## Contributing

As the project is still under active development, contribution guidelines will be defined at a later stage. For now, feel free to fork the repository and explore the codebase.

---

*This README provides a general overview. Specific details might evolve as development progresses.*
