// scripts/convert-excel-to-json.js
const XLSX = require('xlsx'); // Use CommonJS require
const fs = require('fs');
const path = require('path');
// No need for fileURLToPath with require

// --- Configuration ---
// Get Excel file path from command-line arguments
const excelFilePath = process.argv[2];
if (!excelFilePath) {
    console.error('Error: Please provide the path to the Excel file as a command-line argument.');
    process.exit(1);
}
const outputDir = path.resolve(__dirname, '../electron/src/assets'); // Use __dirname
const outputJsonPath = path.join(outputDir, 'id_manual_data.json');
const sheetName = 'Sheet1'; // Updated sheet name based on error log
const termIdCol = 'A';
const descriptionCol = 'C';
const statusCol = 'D';
// --- End Configuration ---

console.log(`Starting conversion of ${excelFilePath}...`);

try {
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        console.log(`Creating output directory: ${outputDir}`);
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Read the workbook
    console.log('Reading workbook...');
    // Access functions directly from XLSX object
    const workbook = XLSX.readFile(excelFilePath);

    // Get the specific sheet
    console.log(`Accessing sheet: ${sheetName}...`);
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found in the Excel file. Available sheets: ${Object.keys(workbook.Sheets).join(', ')}`);
    }

    // Convert sheet to an array of objects
    // header: 1 creates an array of arrays
    // range: 1 skips the header row (assuming row 1 is headers)
    // defval: '' ensures empty cells become empty strings
    console.log('Converting sheet data (this might take a while for large files)...');
    // Access utils directly from XLSX object
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 1, defval: '' });

    console.log(`Found ${rows.length} data rows (excluding header). Processing...`);

    const jsonData = [];
    const colIndices = {
        // Access utils directly from XLSX object
        termId: XLSX.utils.decode_col(termIdCol), // 0
        description: XLSX.utils.decode_col(descriptionCol), // 2
        status: XLSX.utils.decode_col(statusCol) // 3
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const termId = String(row[colIndices.termId] ?? '').trim();
        const description = String(row[colIndices.description] ?? '').trim();
        const status = String(row[colIndices.status] ?? '').trim();

        // Basic validation - skip rows where essential data might be missing
        if (termId || description) { // Include if at least termId or description exists
             jsonData.push({
                termId: termId,
                description: description,
                status: status
            });
        }

        // Log progress occasionally
        if ((i + 1) % 5000 === 0) {
            console.log(`Processed ${i + 1} rows...`);
        }
    }

    // Write the JSON data to the output file
    console.log(`Writing ${jsonData.length} entries to ${outputJsonPath}...`);
    fs.writeFileSync(outputJsonPath, JSON.stringify(jsonData, null, 2)); // Pretty print JSON

    console.log('Conversion successful!');
    console.log(`JSON data saved to: ${outputJsonPath}`);

} catch (error) {
    console.error('Error during conversion:', error);
    process.exit(1); // Exit with error code
}
