import React, { useState, useEffect } from 'react'; // Import useState and useEffect correctly
import { Box, Typography, Paper, Grid, Skeleton, CircularProgress, useTheme, alpha } from '@mui/material';
import ResultCard from './ResultCard';
import CategoryHeader from './CategoryHeader';
// Import appropriate icons
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SearchOffIcon from '@mui/icons-material/SearchOff'; // Icon for empty state
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';

/**
 * Displays a panel containing search results for a specific category.
 * Shows a header with title and icon, loading skeletons, an empty state message,
 * or a grid/list of `ResultCard` components. Handles loading overlays for updates.
 *
 * @param {object} props - Component props.
 * @param {string} props.title - The title to display in the panel header.
 * @param {import('../hooks/useSearchResults').NormalizedResultItem[]} props.results - Array of normalized result items for this category.
 * @param {string|string[]} props.categoryFilter - The category key(s) this panel represents (e.g., 'fullMatches', 'vagueUSPTO').
 * @param {string} [props.searchType] - The type of search associated with these results (e.g., 'uspto'), used for context.
 * @param {number} [props.elevation=0] - The elevation shadow level for the panel's Paper component.
 * @param {boolean} [props.showSource=false] - Whether to display the source (USPTO/MGS) on each ResultCard.
 * @param {boolean} [props.isLoading=false] - True if results for this category are currently loading (e.g., live search running).
 * @param {import('../hooks/useSearchResults').AllSuggestionsState} props.allSuggestions - State object holding AI suggestions for terms (passed down to ResultCard).
 * @param {(term: string, reason: string, example: string) => Promise<void>} props.fetchSuggestionsForTerm - Function to trigger fetching AI suggestions (passed down to ResultCard).
 */
function SearchResultsPanel({
    title,
    results,
    categoryFilter,
    searchType,
    elevation = 0,
    showSource = false,
    isLoading = false,
    // Add new props for suggestions
    allSuggestions,
    fetchSuggestionsForTerm
}) {
    const theme = useTheme();
    const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);

    useEffect(() => {
        let timer;
        if (isLoading && results.length > 0) {
            // Delay showing overlay slightly to allow initial results to render
            timer = setTimeout(() => {
                setShowLoadingOverlay(true);
            }, 50); // 50ms delay
        } else {
            setShowLoadingOverlay(false); // Hide immediately if not loading or no results
        }

        return () => clearTimeout(timer); // Cleanup timer on unmount or prop change
    }, [isLoading, results.length]); // Rerun effect if isLoading or results length changes


    // Determine the icon based on the primary category filter or title
    const getHeaderIcon = () => {
        const primaryFilter = Array.isArray(categoryFilter) ? categoryFilter[0] : categoryFilter;
        switch (primaryFilter) {
            case 'fullMatches': return <CheckCircleOutlineIcon />;
            case 'acceptableUSPTO': return <ThumbUpOffAltIcon />; // Use new key
            case 'vagueUSPTO': return <ReportProblemOutlinedIcon />; // Use new key
            case 'otherResults': return <DeleteSweepOutlinedIcon />; // Use new key, map to the "Other" icon
            // Removed deletedDescriptions and noMatch cases
            default: return <ErrorOutlineIcon />; // Fallback icon
        }
    };

    const headerIcon = getHeaderIcon();

    const renderContent = () => {
        if (isLoading && results.length === 0) {
            // Show Skeleton loaders while loading initial results for this panel
            return (
                <Grid container spacing={3}> {/* Increased spacing */}
                    {Array.from(new Array(3)).map((_, index) => (
                        // Use lg={6} here for consistency during loading skeleton display
                        <Grid item xs={12} md={6} lg={6} key={index}>
                            <Skeleton variant="rectangular" height={118} sx={{ borderRadius: 2 }} />
                        </Grid>
                    ))}
                </Grid>
            );
        }

        if (!isLoading && results.length === 0) {
            // Show enhanced empty state message
            return (
                <Box sx={{
                    p: 4,
                    textAlign: 'center',
                    width: '100%',
                    bgcolor: 'action.hover', // Use subtle background
                    borderRadius: 2,
                    border: '1px dashed',
                    borderColor: 'divider'
                }}>
                    <SearchOffIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                    <Typography variant="body1" color="text.secondary">
                        No results found in this category.
                    </Typography>
                </Box>
            );
        }

        const primaryFilter = Array.isArray(categoryFilter) ? categoryFilter[0] : categoryFilter;

        // Determine content based on category
        let resultsContent;

        if (primaryFilter === 'noMatch') {
            // Render 'noMatch' results as a styled list
            resultsContent = (
                // Use Paper for a slightly elevated look and consistent background
                <Paper variant="outlined" sx={{ bgcolor: alpha(theme.palette.error.main, 0.05), width: '100%' }}>
                    <List dense sx={{ width: '100%', p: 0 /* Remove default padding */ }}>
                        {results.map((result, index) => (
                            <ListItem
                                key={`${result.term}-${result.source || searchType}-${index}`}
                                sx={{
                                    borderBottom: index < results.length - 1 ? '1px solid' : 'none',
                                    borderColor: 'divider',
                                    py: 1.5, // Increased vertical padding
                                    px: 2, // Horizontal padding
                                    alignItems: 'flex-start', // Align items to the top
                                    '&:hover': { // Add a subtle hover effect
                                        bgcolor: alpha(theme.palette.action.hover, 0.4)
                                    }
                                }}
                            >
                                <ErrorOutlineIcon sx={{ color: 'error.main', mr: 1.5, mt: 0.5, fontSize: '1.2rem' }} /> {/* Icon */}
                                <ListItemText
                                    primary={result.term}
                                    primaryTypographyProps={{ variant: 'body2' }} // Use body2 for slightly smaller text
                                    // Display source if available
                                    secondary={result.source ? `Source: ${result.source}` : null}
                                    secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary', mt: 0.5 }}
                                />
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            );
        } else {
            // Default Grid layout for other categories (Full Matches, Acceptable, Vague, Deleted)
            resultsContent = (
                <Grid container spacing={3}> {/* Consistent spacing */}
                    {results.map((result, index) => {
                        // --- REMOVE LOGGING HERE ---
                        // ------------------------

                        // Destructure props passed from useSearchResults, including vagueness info, description, AND descriptionExample
                        const { term, status, source, termId, classNumber, matchType, isVague, vaguenessReasoning, description, descriptionExample, searchDate } = result; // Added searchDate
                        const cardSource = showSource ? source : undefined;

                        // --- REMOVE LOGGING HERE ---
                        // ------------------------

                        return (
                            // Use lg={6} for card-based results (2 cards per row on large screens)
                            <Grid item xs={12} md={6} lg={6} key={`${term}-${source || searchType}-${index}`}>
                                <ResultCard
                                    term={term}
                                    status={status}
                                    source={cardSource}
                                    termId={termId}
                                    classNumber={classNumber}
                                    matchType={matchType}
                                    isVague={isVague}
                                    vaguenessReasoning={vaguenessReasoning}
                                    description={description} // Pass the description prop
                                    descriptionExample={descriptionExample}
                                    searchDate={searchDate} // Pass the searchDate prop
                                    // Pass suggestion state and function for this specific term
                                    suggestionData={allSuggestions?.[term.toLowerCase()]}
                                    fetchSuggestions={fetchSuggestionsForTerm}
                                />
                            </Grid>
                        );
                    })}
                </Grid>
            );
        }


        // Wrap content in a relative Box and add overlay if loading with existing results
        return (
            <Box sx={{ position: 'relative', minHeight: 100 /* Ensure some height for overlay */ }}>
                {resultsContent}
                {/* Use local state to control overlay */}
                {showLoadingOverlay && (
                    <Box sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: alpha(theme.palette.background.default, 0.7), // Semi-transparent overlay
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1, // Ensure overlay is on top
                        borderRadius: 1, // Match content rounding if applicable
                    }}>
                        <CircularProgress />
                    </Box>
                )}
            </Box>
        );
    };

    // Standard Panel Structure used for all categories now
    return (
        <Paper
            elevation={elevation}
            sx={{
                height: '100%', // Ensure paper takes height if needed in grid
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 2, // Consistent rounding
                overflow: 'hidden', // Needed if content might overflow header
                 //bgcolor: 'background.paper', // Set base background
            }}
        >
            <CategoryHeader title={title} icon={headerIcon} />
            <Box sx={{
                flexGrow: 1,
                overflow: 'auto', // Allow scrolling within the content area only
                p: 2, // Padding inside the content area
                bgcolor: 'background.default', // Match main background for seamless feel
            }}>
                {renderContent()}
            </Box>
        </Paper>
    );
}

export default SearchResultsPanel;
