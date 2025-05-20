import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Renders a simple header for a category section within a results panel.
 * Displays an optional icon and a title.
 *
 * @param {object} props - Component props.
 * @param {string} props.title - The title text for the header.
 * @param {React.ReactElement} [props.icon] - Optional icon element to display before the title.
 */
function CategoryHeader({ title, icon }) {
  return (
    <Box
      component="header"
      sx={{
        py: 1, // Reduced padding slightly
        px: 2,
        // bgcolor: 'background.paper', // Use Paper's background
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        minHeight: 48, // Ensure consistent height
      }}
    >
      {icon && <Box sx={{ mr: 1.5, color: 'primary.main', display: 'inline-flex' }}>{React.cloneElement(icon, { fontSize: 'small' })}</Box>}
      <Typography variant="h6" component="h2" sx={{ fontWeight: 500, fontSize: '1.1rem' }}> {/* Adjusted typography */}
        {title}
      </Typography>
    </Box>
  );
}

export default CategoryHeader;
