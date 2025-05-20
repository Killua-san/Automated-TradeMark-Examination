import React, { useState, useCallback } from 'react'; // Import useState and useCallback
import { Card, CardHeader, CardContent, Collapse, IconButton, Typography, Box, Chip, Tooltip, Stack, Divider, Button, CircularProgress, List, ListItem, ListItemText } from '@mui/material'; // Added Button, CircularProgress, List, ListItem, ListItemText
import { styled, alpha, useTheme } from '@mui/material/styles';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
// Import specific icons for suggestion feature
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt'; // For Acceptable
import ReportProblemIcon from '@mui/icons-material/ReportProblem'; // For Vague
import DeleteIcon from '@mui/icons-material/Delete';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'; // For Partial/Larger
import ErrorIcon from '@mui/icons-material/Error'; // For Errors/No Match
import InfoIcon from '@mui/icons-material/Info'; // For general info

const ExpandMore = styled((props) => {
  const { expand, ...other } = props;
  return <IconButton {...other} />;
})(({ theme, expand }) => ({
  transform: !expand ? 'rotate(0deg)' : 'rotate(180deg)',
  marginLeft: 'auto',
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.shortest,
  }),
}));

// Helper to get status details (icon, color, simplified text) based on matchType, source, status, and isVague
const getStatusDetails = (matchType, source, isVague, status) => { // Removed status from args, added isVague
    // Default status text (less relevant now, but keep as fallback)
    let defaultText = status || "Unknown Status"; // Status here refers to the original string, not the 'D'/'A' status prop

    // --- Handle Local Sources First ---
    if (source === 'local') { // Exact local match
        // The 'status' prop passed to ResultCard for 'local' source is the 'D'/'A' status
        if (status === 'D') {
            // Deleted exact local match - vagueness check was run
            if (isVague === true) {
                 return { icon: <ReportProblemIcon fontSize="inherit" />, color: 'warning.main', text: "Deleted & Potentially Vague (Local)" };
            } else if (isVague === false) {
                 return { icon: <DeleteIcon fontSize="inherit" />, color: 'text.secondary', text: "Deleted & Acceptable (Local)" };
            } else { // Vagueness check failed or not run?
                 return { icon: <DeleteIcon fontSize="inherit" />, color: 'text.secondary', text: "Deleted (Local)" };
            }
        } else {
            // Active exact local match - treat as 'full' visually, no vagueness check run
            return { icon: <CheckCircleIcon fontSize="inherit" />, color: 'success.main', text: "" }; // Empty text, ID/Class shown in header
        }
    } else if (source === 'local-partial') { // Partial local match
         // Vagueness check was run on the original term
         if (isVague === true) {
             return { icon: <ReportProblemIcon fontSize="inherit" />, color: 'warning.main', text: "Potentially Vague (Local Partial)" };
         } else if (isVague === false) {
             return { icon: <ThumbUpAltIcon fontSize="inherit" />, color: 'info.main', text: "Acceptable (Local Partial)" };
         } else { // Vagueness check failed?
              return { icon: <HelpOutlineIcon fontSize="inherit" />, color: 'info.main', text: "Partial Match (Local)" };
         }
    }

    // --- Handle Other Sources (USPTO, MGS, etc.) ---
    switch (matchType) {
        case 'full': // DB/Live full matches
            // For DB/Live full matches
            return { icon: <CheckCircleIcon fontSize="inherit" />, color: 'success.main', text: "" };
        case 'deleted':
             // For DB/Live deleted matches (matchType derived in useSearchResults)
            return { icon: <DeleteIcon fontSize="inherit" />, color: 'text.secondary', text: "Deleted (DB/Live)" };
        case 'partial':
            // USPTO partial matches (vagueness check was run)
            if (isVague === true) {
                return { icon: <ReportProblemIcon fontSize="inherit" />, color: 'warning.main', text: "Potentially Vague (USPTO)" };
            } else if (isVague === false) {
                return { icon: <ThumbUpAltIcon fontSize="inherit" />, color: 'info.main', text: "Acceptable/Partial (USPTO)" };
            } else { // Vagueness check failed?
                 return { icon: <HelpOutlineIcon fontSize="inherit" />, color: 'info.main', text: "Partial Match (USPTO)" };
            }
        // Note: MGS results don't have matchType 'partial' in current implementation, they have specific source strings like 'mgs-nice-on'
        case 'none':
             return { icon: <ErrorIcon fontSize="inherit" />, color: 'error.main', text: "No Match Found" };
        case 'cancelled': // Should ideally not reach here if handled upstream, but keep for safety
             return { icon: <ReportProblemIcon fontSize="inherit" />, color: 'text.secondary', text: "Cancelled" };
        case 'error':
             return { icon: <ErrorIcon fontSize="inherit" />, color: 'error.main', text: "Search Error" };
        default: // Unknown or other cases
            return { icon: <HelpOutlineIcon fontSize="inherit" />, color: 'text.secondary', text: defaultText };
    }
};

// Updated props: termId, classNumber, matchType, isVague, vaguenessReasoning, descriptionExample are now passed directly
// Added suggestionData and fetchSuggestions props
/**
 * Displays a single search result in a card format.
 * Shows the term, status icon/text, source, and potentially Term ID/Class.
 * Allows expanding (for non-exact-local matches) to view details like descriptions,
 * vagueness analysis, AI suggestions (if applicable), and search date.
 *
 * @param {object} props - Component props.
 * @param {string} props.term - The search term associated with this result.
 * @param {'D'|'A'|undefined} props.status - The status ('D'eleted or 'A'ctive) specifically for 'local' source results.
 * @param {string} props.source - The normalized source of the result (e.g., 'USPTO', 'local', 'MGS (NICE On)').
 * @param {string|null} props.termId - The Term ID, if available.
 * @param {string|null} props.classNumber - The NICE class number, if available.
 * @param {import('../hooks/useSearchResults').MatchType} props.matchType - The type of match.
 * @param {boolean|null} props.isVague - Whether the term was deemed vague by AI analysis.
 * @param {string|null} props.vaguenessReasoning - The reasoning provided by the AI for vagueness.
 * @param {string|null} props.description - The exact description (for 'local' source results).
 * @param {string|null} props.descriptionExample - An example description (for partial/template results).
 * @param {string|null} props.searchDate - ISO string representation of when the result was obtained/cached.
 * @param {import('../hooks/useSearchResults').SuggestionState|undefined} props.suggestionData - Object containing AI suggestions state for this term ({ suggestions, isLoading, error }).
 * @param {(term: string, reason: string, example: string) => Promise<void>} props.fetchSuggestions - Function to trigger fetching AI suggestions for this term.
 */
function ResultCard({
    term,
    status, // 'D' or 'A' for source='local', potentially undefined otherwise
    source,
    termId,
    classNumber,
    matchType,
    isVague,
    vaguenessReasoning,
    description, // Added: The exact description for 'local' source
    descriptionExample, // Existing: Example for 'partial' or 'local-partial'
    searchDate, // Added: Date of the search/cache entry
    // Removed isAnalyzingVagueness prop
    suggestionData, // Prop containing { suggestions: [], isLoading: boolean, error: string | null }
    fetchSuggestions // Prop function to trigger fetching
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  // Removed local suggestion state

  // Determine if the card should be expandable (only if NOT an active exact local match)
  const isActiveExactLocal = source === 'local' && status !== 'D';
  const isExpandable = !isActiveExactLocal;
  // Determine if it's a "No Match" type for styling/click behavior
  const isNoMatch = matchType === 'none';

  // Get display details based on the new props - pass isVague and status ('D'/'A')
  const { icon: statusIcon, color: statusColor, text: statusText } = getStatusDetails(matchType, source, isVague, status);

  const handleExpandClick = useCallback((event) => {
    event.stopPropagation(); // Prevent card click handler when clicking the icon directly
    if (isExpandable) {
      setExpanded(prev => !prev);
    }
  }, [isExpandable]); // Dependency array

  const handleCardClick = useCallback(() => {
    // Only expand if it's expandable AND not currently expanded
    if (isExpandable && !expanded) {
      setExpanded(true); // Only sets to true
    }
  }, [isExpandable, expanded]);

  // --- Function to trigger fetching AI suggestions via prop ---
  const handleFetchSuggestionsClick = useCallback((e) => {
      e.stopPropagation(); // Prevent card click/expand
      if (fetchSuggestions) {
          // Call the function passed down from the hook
          fetchSuggestions(term, vaguenessReasoning, descriptionExample);
      } else {
          console.error("fetchSuggestions function not provided to ResultCard for term:", term);
      }
  }, [fetchSuggestions, term, vaguenessReasoning, descriptionExample]);

  // Render details for the expanded section (only for non-full matches)
  const renderDetailsContent = () => {
    if (isActiveExactLocal) return null; // Active exact local matches don't expand

    // Use the passed vaguenessReasoning and isVague props directly
    const vaguenessClass = typeof isVague === 'boolean' ? (isVague ? "Vague" : "Not Vague") : "Not Analyzed";
    const vaguenessReason = vaguenessReasoning || "N/A"; // Use prop, fallback to N/A
    const vaguenessColor = vaguenessClass === "Vague" ? theme.palette.warning.dark : (vaguenessClass === "Not Vague" ? theme.palette.success.dark : theme.palette.text.secondary); // Use darker theme colors for better contrast

    // Determine which description to show (exact for 'local', example otherwise)
    const displayDescription = source === 'local' ? description : descriptionExample;
    const descriptionLabel = source === 'local' ? "Description:" : "Example Description:";

    return (
        <Stack spacing={1.5}>
            {/* Display description or example description */}
            {displayDescription && (
                <Typography variant="body2">
                    <b>{descriptionLabel}</b> "{displayDescription}"
                </Typography>
            )}
            {/* Display Term ID and Class Number if available */}
            {termId && <Typography variant="body2"><b>Term ID:</b> {termId}</Typography>}
            {classNumber && <Typography variant="body2"><b>Class (MGS):</b> {classNumber}</Typography>}

            {/* Display vagueness details if reasoning is available */}
            {vaguenessReasoning && ( // Show this section only if reasoning exists
              <Box sx={{ borderLeft: 3, borderColor: vaguenessColor, pl: 1.5, py: 0.5, my: 1, bgcolor: alpha(vaguenessColor, 0.05) }}>
                 {/* Removed the isAnalyzingVagueness check here */}
                 <Typography variant="body2" component="span" sx={{ color: vaguenessColor, fontWeight: 'bold' }}>Vagueness Analysis: {vaguenessClass}</Typography>
                 <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>Reasoning: {vaguenessReason}</Typography>

                {/* Suggestion Button and Display Area - Only show if result is vague */}
                {isVague === true && ( // Condition based only on isVague now
                  <Box sx={{ mt: 1.5 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={suggestionData?.isLoading ? <CircularProgress size={16} /> : <AutoFixHighIcon />}
                      onClick={handleFetchSuggestionsClick} // Use the new handler
                      disabled={suggestionData?.isLoading}
                      sx={{ mb: 1 }}
                    >
                      {suggestionData?.isLoading ? 'Getting Suggestions...' : 'Suggest Alternatives'}
                    </Button>

                    {/* Display Suggestions or Error using suggestionData prop */}
                    {suggestionData?.error && (
                      <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
                        Error: {suggestionData.error}
                      </Typography>
                    )}
                    {/* Check suggestionData.suggestions instead of local state */}
                    {suggestionData?.suggestions && suggestionData.suggestions.length > 0 && (
                       <Box mt={1}>
                         <Typography variant="caption" fontWeight="bold" color="text.secondary">Suggested Alternatives:</Typography>
                         <List dense disablePadding sx={{ pl: 1, mt: 0.5 }}>
                            {suggestionData.suggestions.map((suggestion, index) => (
                              <ListItem key={index} disableGutters sx={{ py: 0.25 }}>
                                <ListItemText>
                                  <Typography variant="body2" component="span">
                                      &bull; {suggestion.suggestion}
                                      {/* Display class number if available */}
                                      {suggestion.class !== null && (
                                          <Typography variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
                                              (Class: {suggestion.class})
                                          </Typography>
                                      )}
                                  </Typography>
                                </ListItemText>
                              </ListItem>
                            ))}
                         </List>
                       </Box>
                    )}
                  </Box>
                )}
              </Box>
            )}
            {matchType === 'deleted' && <Typography variant="body2"><b>Status:</b> Deleted (D)</Typography>}
            {/* Display Source and Date */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                {source && <Typography variant="caption" color="text.secondary">Source: {source}</Typography>}
                {searchDate && source !== 'local' && source !== 'local-partial' && ( // Don't show date for local file results
                    <Tooltip title={`Result obtained on: ${new Date(searchDate).toLocaleString()}`}>
                        <Typography variant="caption" color="text.secondary">
                            Date: {new Date(searchDate).toLocaleDateString()}
                        </Typography>
                    </Tooltip>
                )}
            </Box>
            {matchType === 'none' && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No matching descriptions found in this source.</Typography>}
             {matchType === 'error' && <Typography variant="body2" color="error.main" sx={{ mt: 1 }}>Search Error</Typography>} {/* Simplified error display */}
             {matchType === 'cancelled' && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Search Cancelled</Typography>}
        </Stack>
      );
  };

  // --- Add console logging for debugging ---
  // -----------------------------------------

  // --- Add console logging for debugging ---
  // console.log("Rendering ResultCard:", { term, matchType, isVague, vaguenessReasoning, descriptionExample });
  // -----------------------------------------

  return (
    <Card
      elevation={1}
      sx={{
        transition: theme.transitions.create(['box-shadow', 'transform'], {
          duration: theme.transitions.duration.short,
        }),
        // Conditionally apply cursor and hover effect
        cursor: !isExpandable ? 'default' : 'pointer',
        '&:hover': !isExpandable ? {} : {
          transform: 'translateY(-3px)',
          boxShadow: theme.shadows[4],
        },
        overflow: 'visible',
        // Removed explicit bgcolor: 'background.paper' to rely on theme default
      }}
      onClick={handleCardClick} // Click handler now checks isExpandable
    >
      <CardHeader
        // Removed avatar prop
        action={
          isExpandable ? ( // Only show expand icon if expandable
            <ExpandMore
              expand={expanded}
              onClick={handleExpandClick}
              aria-expanded={expanded}
              aria-label="show more"
            >
              <ExpandMoreIcon />
            </ExpandMore>
          ) : null
        }
        title={
          <Typography variant="subtitle1" component="span" sx={{ fontWeight: 500 }}>
             {term.charAt(0).toUpperCase() + term.slice(1)}
          </Typography>
        }
        subheader={
          // Main stack for subheader content
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            {/* Render icon first for all types */}
            <Box sx={{ color: statusColor, display: 'inline-flex', fontSize: '1.1rem', mr: matchType !== 'full' ? 0.5 : 0 /* Add margin only if text follows */ }}>
                {statusIcon}
            </Box>

            {/* Render specific content based on source and matchType */}
            {isActiveExactLocal ? (
                // Active Exact Local Match: Show ID/Class
                <>
                    {termId && <Chip label={`ID: ${termId}`} size="small" variant="outlined" sx={{ mr: 0.5 }} />}
                    {classNumber && <Chip label={`Class: ${classNumber}`} size="small" variant="outlined" sx={{ mr: 0.5 }} />}
                </>
            ) : (
                 // Other types: Render status text after the icon
                 <Typography variant="body2" sx={{ color: statusColor, fontWeight: 500 }}>
                     {statusText}
                 </Typography>
            )}

            {/* Render source chip last if available */}
             {source && (
               <Chip label={source} size="small" variant="outlined" sx={{ height: 'auto', fontSize: '0.75rem', '& .MuiChip-label': { px: 1, py: 0.25 }, ml: 0.5 /* Add margin if status text is present */ }}/>
             )}
          </Stack>
        }
        sx={{
           '& .MuiCardHeader-action': { alignSelf: 'center' },
            py: 1.25, // Consistent padding
          }}
        />
        {/* Conditionally render Collapse section */}
        {isExpandable && (
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Divider sx={{ opacity: 0.6 }} />
            <CardContent sx={{ bgcolor: alpha(theme.palette.action.selected, 0.05) }}>
              {renderDetailsContent()}
            </CardContent>
         </Collapse>
        )}
    </Card>
  );
 }

 export default ResultCard; // Export the component directly
