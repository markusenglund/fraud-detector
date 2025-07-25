import { readFileSync } from "fs";
import path from "path";
import xlsx from "xlsx";
import { Sheet } from "../entities/Sheet";
import { MetadataSchema } from "../types/metadata";
import { ExcelFileData } from "../types/ExcelFileData";

export function loadExcelFileFromFolder(
  datasetFolder: string,
  fileIndex: number = 0,
): ExcelFileData {
  const metadataPath = path.join(datasetFolder, "metadata.json");

  // Read and validate metadata
  const metadataContent = readFileSync(metadataPath, "utf-8");
  const metadataJson = JSON.parse(metadataContent);
  const metadata = MetadataSchema.parse(metadataJson);

  // Validate file index range
  if (fileIndex < 0 || fileIndex >= metadata.files.length) {
    throw new Error(
      `Invalid file index: ${fileIndex}. Available files: 0-${metadata.files.length - 1}`,
    );
  }

  const selectedFile = metadata.files[fileIndex];
  const excelPath = path.join(datasetFolder, selectedFile.name);
  const workbook = xlsx.readFile(excelPath, { sheetRows: 5000 });

  const sheets: Sheet[] = [];
  workbook.SheetNames.forEach((sheetName) => {
    const workbookSheet = workbook.Sheets[sheetName];
    try {
      const sheet = new Sheet(workbookSheet, sheetName);
      sheets.push(sheet);
    } catch (err) {
      console.log(`Skipping sheet '${sheetName}' due to error: ${err.message}`);
    }
  });

  const readmePath = path.join(datasetFolder, "README.md");
  const readmeContent = readFileSync(readmePath, "utf-8");

  return {
    sheets,
    excelFileName: selectedFile.name,
    articleName: metadata.name,
    readmeContent,
    excelDataFolder: datasetFolder,
  };
}
