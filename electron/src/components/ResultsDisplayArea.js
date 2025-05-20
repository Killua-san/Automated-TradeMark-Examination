import React, { useState, useCallback } from 'react';
import { Document, Packer, Paragraph, TextRun } from 'docx'; // Import docx components
import {
  Box,
  AppBar,
  Button, // Import Button
  Toolbar, // Import Toolbar
  ToggleButton, // Import ToggleButton
  ToggleButtonGroup, // Import ToggleButtonGroup
  Tabs,
  Tab,
  Grid,
  Typography, // Import Typography for label
  TextField, // Import TextField for the new search input
} from '@mui/material';
import SearchResultsPanel from './SearchResultsPanel';
// Import category icons
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import FileDownloadIcon from '@mui/icons-material/FileDownload'; // Icon for export button

/**
 * Renders the main content area for displaying search results.
 * Includes tabs for different result categories (Full Matches, Acceptable, Vague, Other),
 * a source filter (All, USPTO, MGS), and panels to display the actual results.
 * Also includes functionality to export vague results to a Word document.
 *
 * @param {object} props - Component props.
 * @param {number} props.selectedTab - The index of the currently active tab.
 * @param {(event: React.SyntheticEvent, newValue: number) => void} props.onTabChange - Callback when the selected tab changes.
 * @param {import('../hooks/useSearchResults').CategorizedResults} props.resultsByCategory - Object containing arrays of results grouped by category.
 * @param {boolean} props.isUsptoLoading - True if the live USPTO search is currently loading.
 * @param {boolean} props.isMgsLoading - True if the live MGS search is currently loading.
 * @param {import('../hooks/useSearchResults').AllSuggestionsState} props.allSuggestions - State object holding AI suggestions for terms.
 * @param {(term: string, reason: string, example: string) => Promise<void>} props.fetchSuggestionsForTerm - Function to trigger fetching AI suggestions.
 */
function ResultsDisplayArea({
  selectedTab,
  onTabChange,
  resultsByCategory,
  isUsptoLoading,
  isMgsLoading,
  // Add new props for suggestions
  allSuggestions,
  fetchSuggestionsForTerm,
}) {
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'uspto', 'mgs'
  const [displayedResultsQuery, setDisplayedResultsQuery] = useState(''); // State for the new search input
  const [isExporting, setIsExporting] = useState(false); // State for export loading

  // Handler for the source filter toggle
  const handleSourceFilterChange = useCallback((event, newFilter) => {
    // Prevent unselecting all buttons
    if (newFilter !== null) {
      setSourceFilter(newFilter);
      console.log("Source filter changed to:", newFilter);
    }
  }, []);

  // Helper function to filter results based on the current sourceFilter state
  const filterResultsBySource = useCallback((results) => {
    if (!results) return []; // Handle undefined/null results gracefully
    if (sourceFilter === 'all') {
      return results;
    }
    if (sourceFilter === 'uspto') {
      return results.filter(item => item.source === 'USPTO');
    }
    if (sourceFilter === 'mgs') {
      // Match 'MGS (NICE On)' and 'MGS (NICE Off)' etc.
      return results.filter(item => item.source?.startsWith('MGS'));
    }
    return results; // Should not happen, but return all as fallback
  }, [sourceFilter]); // Re-create only when sourceFilter changes

  // Helper function to filter results based on the displayedResultsQuery state
  const filterByDisplayedQuery = useCallback((results) => {
    if (!results) return [];
    if (!displayedResultsQuery) return results; // If query is empty, return all results

    const queryLower = displayedResultsQuery.toLowerCase();
    return results.filter(item => {
      const term = item.term?.toLowerCase() || '';
      const status = item.status?.toLowerCase() || '';
      const description = item.description?.toLowerCase() || '';
      const descriptionExample = item.descriptionExample?.toLowerCase() || '';
      const vaguenessReasoning = item.vaguenessReasoning?.toLowerCase() || '';
      const termId = item.termId?.toLowerCase() || '';
      const classNumber = item.classNumber?.toLowerCase() || '';
      const source = item.source?.toLowerCase() || '';

      return term.includes(queryLower) ||
             status.includes(queryLower) ||
             description.includes(queryLower) ||
             descriptionExample.includes(queryLower) ||
             vaguenessReasoning.includes(queryLower) ||
             termId.includes(queryLower) ||
             classNumber.includes(queryLower) ||
             source.includes(queryLower);
    });
  }, [displayedResultsQuery]);

  // --- Pre-filter results for count and panel rendering ---
  // Apply source filtering first
  let preFilteredFullMatches = filterResultsBySource(resultsByCategory.fullMatches);
  let preFilteredAcceptableUSPTO = filterResultsBySource(resultsByCategory.acceptableUSPTO);
  let preFilteredVagueUSPTO = filterResultsBySource(resultsByCategory.vagueUSPTO);
  let preFilteredOtherResults = filterResultsBySource(resultsByCategory.otherResults);

  // Then apply the displayed results query filter
  const filteredFullMatches = filterByDisplayedQuery(preFilteredFullMatches);
  const filteredAcceptableUSPTO = filterByDisplayedQuery(preFilteredAcceptableUSPTO);
  const filteredVagueUSPTO = filterByDisplayedQuery(preFilteredVagueUSPTO);
  const filteredOtherResults = filterByDisplayedQuery(preFilteredOtherResults);

  // Determine the count of currently displayed results
  let displayedCount = 0;
  switch (selectedTab) {
    case 0:
      displayedCount = filteredFullMatches.length;
      break;
    case 1:
      displayedCount = filteredAcceptableUSPTO.length;
      break;
    case 2:
      displayedCount = filteredVagueUSPTO.length;
      break;
    case 3:
      displayedCount = filteredOtherResults.length;
      break;
    default:
      displayedCount = 0;
  }

  // --- Export Functionality ---
  const handleExportVagueResults = useCallback(async () => {
    // Use the pre-filtered vague results for export
    if (filteredVagueUSPTO.length === 0) {
      console.log("No vague results to export.");
      // Optionally show a message to the user
      return;
    }

    setIsExporting(true);
    console.log("Starting export for vague results...");

    try {
      // Create document content
      const docChildren = [
        new Paragraph({
          children: [
            new TextRun({
              text: "The following descriptions are vague:",
              bold: true,
              size: 28, // 14pt font size
            }),
          ],
          spacing: { after: 200 }, // Add some space after the title
        }),
      ];

      filteredVagueUSPTO.forEach(result => {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: result.term, // Assuming 'term' holds the description
                size: 24, // 12pt font size
              }),
            ],
            spacing: { after: 100 }, // Space between list items
          })
        );
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: docChildren,
        }],
      });

      // Generate buffer
      const buffer = await Packer.toBuffer(doc);

      // Send buffer to main process for saving
      window.electronAPI.exportToWord(buffer);
      console.log("Sent vague results buffer to main process for saving.");

    } catch (error) {
      console.error("Error generating or sending Word document:", error);
      // Optionally show an error message to the user
    } finally {
      setIsExporting(false);
    }
  }, [filteredVagueUSPTO]); // Dependency on the pre-filtered vague results data


  // Helper to render the correct panel based on the selected tab, using pre-filtered results
  const renderResultsPanel = () => {
    const isAnyLiveSearchLoading = isUsptoLoading || isMgsLoading;
    // Pass suggestion props down to SearchResultsPanel
    const panelPropsBase = {
        elevation: 0,
        showSource: true,
        allSuggestions,
        fetchSuggestionsForTerm
    };

    // Use the pre-filtered results
    switch (selectedTab) {
      case 0: // Full Matches
        return <SearchResultsPanel title="Full Matches" results={filteredFullMatches} categoryFilter="fullMatches" {...panelPropsBase} isLoading={false} />;
      case 1: // Acceptable (USPTO)
        return <SearchResultsPanel title="Acceptable (USPTO)" results={filteredAcceptableUSPTO} categoryFilter="acceptableUSPTO" searchType="uspto" {...panelPropsBase} showSource={false} isLoading={isUsptoLoading} />;
      case 2: // Vague (USPTO)
        return <SearchResultsPanel title="Vague (USPTO)" results={filteredVagueUSPTO} categoryFilter="vagueUSPTO" searchType="uspto" {...panelPropsBase} showSource={false} isLoading={isUsptoLoading} />;
      case 3: // Other Results (Combined)
        return <SearchResultsPanel title="Other Results" results={filteredOtherResults} categoryFilter="otherResults" {...panelPropsBase} isLoading={isAnyLiveSearchLoading} />;
      default:
        return null;
    }
  };

  return (
    <Box
      component="main"
      sx={{
        flexGrow: 1,
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        // Removed bgcolor: 'background.default' from root Box
      }}
    >
      <AppBar
        position="static"
        color="default"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0, zIndex: 1100 /* Ensure AppBar is above content */ }}
      >
        {/* Use Toolbar to structure AppBar content */}
        <Toolbar variant="dense" sx={{ flexDirection: 'column', alignItems: 'flex-start', p: 0 }}>
          <Tabs
            value={selectedTab}
          onChange={onTabChange} // Use prop callback
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
            aria-label="Search Result Categories"
            sx={{ width: '100%', '& .MuiTab-root': { minHeight: 48 } }} // Adjust minHeight if needed
          >
            <Tab icon={<CheckCircleOutlineIcon />} iconPosition="start" label="Full Matches" id="tab-0" aria-controls="tabpanel-0" />
            <Tab icon={<ThumbUpOffAltIcon />} iconPosition="start" label="Acceptable (USPTO)" id="tab-1" aria-controls="tabpanel-1" />
            <Tab icon={<ReportProblemOutlinedIcon />} iconPosition="start" label="Vague (USPTO)" id="tab-2" aria-controls="tabpanel-2" />
            <Tab icon={<DeleteSweepOutlinedIcon />} iconPosition="start" label="Other Results" id="tab-3" aria-controls="tabpanel-3" />
          </Tabs>

          {/* Source Filter Toggle Buttons - Placed below Tabs */}
          {/* Source Filter, Displayed Results Search, and Export Button Container */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1, width: '100%', borderTop: 1, borderColor: 'divider', gap: 2 }}>
             {/* Left Group: Source Filter */}
             <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <Typography variant="caption" sx={{ mr: 1, color: 'text.secondary', whiteSpace: 'nowrap' }}>Filter by Source:</Typography>
                <ToggleButtonGroup
                value={sourceFilter}
                exclusive
                onChange={handleSourceFilterChange}
                aria-label="Filter results by source"
                size="small" // Make buttons smaller
             >
                <ToggleButton value="all" aria-label="Show all results">
                   All
                </ToggleButton>
                <ToggleButton value="uspto" aria-label="Show USPTO results only">
                      USPTO
                   </ToggleButton>
                   <ToggleButton value="mgs" aria-label="Show MGS results only">
                      MGS
                   </ToggleButton>
                </ToggleButtonGroup>
             </Box>

            {/* Middle: Search within results */}
            <Box sx={{ flexGrow: 1, minWidth: '200px' }}>
              <TextField
                fullWidth
                size="small"
                variant="outlined"
                placeholder="Search displayed results..."
                value={displayedResultsQuery}
                onChange={(e) => setDisplayedResultsQuery(e.target.value)}
                InputProps={{
                  sx: { borderRadius: 1 } // Match toggle button border radius
                }}
              />
            </Box>

             {/* Right Group: Results Count and Export Button (Conditional) */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                {displayedCount} {displayedCount === 1 ? 'result' : 'results'}
              </Typography>
              {selectedTab === 2 && ( // Only show for Vague USPTO tab
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<FileDownloadIcon />}
                  onClick={handleExportVagueResults}
                  disabled={isExporting || filteredVagueUSPTO.length === 0} // Disable if exporting or no pre-filtered vague results
                >
                  {isExporting ? 'Exporting...' : 'Export Vague Results'}
                </Button>
              )}
            </Box>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        role="tabpanel"
        hidden={selectedTab < 0 || selectedTab > 3} // Basic validation
        id={`tabpanel-${selectedTab}`}
        aria-labelledby={`tab-${selectedTab}`}
        sx={{
          p: { xs: 1.5, sm: 2, md: 3 },
          flexGrow: 1,
          overflowY: 'auto', // Allow scrolling within the results area
          bgcolor: 'background.paper', // Apply paper background here
          // Apply border only to the top, connecting to AppBar's bottom border
          borderTop: 1,
          borderColor: 'divider',
          // Apply border radius only to bottom corners
          borderBottomLeftRadius: (theme) => theme.shape.borderRadius,
          borderBottomRightRadius: (theme) => theme.shape.borderRadius,
        }}
      >
        {renderResultsPanel()} {/* Use helper function */}
      </Box>
    </Box>
  );
}

export default ResultsDisplayArea;
