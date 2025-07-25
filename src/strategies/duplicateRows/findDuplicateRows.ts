import { type DuplicateRowsResult } from "../../types";
import { DuplicateRow } from "../../entities/DuplicateRow";
import { Sheet } from "../../entities/Sheet";
import { type EnhancedCell } from "../../entities/EnhancedCell";
import { calculateNumberEntropy } from "../../utils/entropy";
import { type ColumnCategorization } from "../../ai/ColumnCategorizer";

function compareRows(
  row1: EnhancedCell[],
  row2: EnhancedCell[],
  colIndices: number[],
  sheet: Sheet,
): DuplicateRow {
  const sharedValues: number[] = [];
  const sharedColumns: number[] = [];

  for (const colIndex of colIndices) {
    const cell1 = row1[colIndex];
    const cell2 = row2[colIndex];
    const areCellsAnalyzable = cell1?.isAnalyzable && cell2?.isAnalyzable;
    if (areCellsAnalyzable) {
      if (cell1.value === cell2.value) {
        sharedValues.push(cell1.value as number);
        sharedColumns.push(colIndex);
      }
    }
  }

  const totalSharedCount = sharedValues.length;
  const rowData = new DuplicateRow(
    [row1[0].row, row2[0].row],
    sharedValues,
    sharedColumns,
    totalSharedCount,
    sheet,
    colIndices.length,
  );

  return rowData;
}

export function findDuplicateRows(
  sheet: Sheet,
  columnCategorization: ColumnCategorization,
): DuplicateRowsResult {
  // Rows require at least one duplicate value with this much entropy to be considered duplicates.
  const minNumberEntropyScore = 200;
  // Rows require a rowEntropyScore of at least this much to be considered duplicates.
  const minSizeAdjustedRowEntropyScore = 4;
  // Rows must have at least this many shared column values to be considered duplicates.
  const minSharedColumns = 2;
  // Bail out if we found >1000 duplicates to avoid performance issues

  const maxDuplicateRows = 1000;
  const duplicateRows: DuplicateRow[] = [];

  // Get numeric columns that should be unique
  const uniqueColumnIndices = columnCategorization.unique
    .flatMap((name) => sheet.getColumnIndicesOfCombinedColumnName(name))
    .filter((index) => sheet.numericColumnIndices.includes(index));

  if (uniqueColumnIndices.length === 0) {
    return { duplicateRows: [] };
  }

  // Build value-to-rows indices for each numeric unique column
  const rowsByHighEntropyValueByColumn = new Map<
    number,
    Map<number, Set<number>>
  >();

  for (const colIndex of uniqueColumnIndices) {
    rowsByHighEntropyValueByColumn.set(colIndex, new Map());
  }

  // Populate the indices
  for (let rowIndex = 1; rowIndex < sheet.numRows; rowIndex++) {
    // Skip header row
    for (const colIndex of uniqueColumnIndices) {
      const cell = sheet.enhancedMatrix[rowIndex]?.[colIndex];
      if (cell?.isAnalyzable) {
        const value = cell.value as number;
        const entropy = calculateNumberEntropy(value);
        if (entropy < minNumberEntropyScore) {
          // Skip low entropy values to improve performance
          continue;
        }
        const columnMap = rowsByHighEntropyValueByColumn.get(colIndex)!;
        if (!columnMap.has(value)) {
          columnMap.set(value, new Set());
        }
        const rowSet = columnMap.get(value)!;
        rowSet.add(rowIndex);
      }
    }
  }

  // Compare rows with shared values and add them to duplicateRows
  const alreadyComparedRowPairs = new Set<string>();
  for (const [_colIndex, valueMap] of rowsByHighEntropyValueByColumn) {
    for (const [_value, rowSet] of valueMap) {
      if (rowSet.size > 1) {
        const rowArray = Array.from(rowSet);
        for (let i = 0; i < rowArray.length; i++) {
          for (let j = i + 1; j < rowArray.length; j++) {
            if (duplicateRows.length > maxDuplicateRows) {
              break;
            }
            const row1Index = rowArray[i];
            const row2Index = rowArray[j];
            const pairKey = `${Math.min(row1Index, row2Index)}-${Math.max(
              row1Index,
              row2Index,
            )}`;

            if (alreadyComparedRowPairs.has(pairKey)) {
              continue; // Skip already compared rows
            }

            const duplicateRow = compareRows(
              sheet.enhancedMatrix[row1Index],
              sheet.enhancedMatrix[row2Index],
              uniqueColumnIndices,
              sheet,
            );
            alreadyComparedRowPairs.add(pairKey);
            if (
              duplicateRow.matrixSizeAdjustedEntropyScore >
                minSizeAdjustedRowEntropyScore &&
              duplicateRow.totalSharedCount >= minSharedColumns
            ) {
              duplicateRows.push(duplicateRow);
            }
          }
        }
      }
    }
  }

  // Sort by entropy score (highest first) then by shared count
  duplicateRows.sort((a, b) => {
    if (b.rowEntropyScore !== a.rowEntropyScore) {
      return b.rowEntropyScore - a.rowEntropyScore;
    }
    return b.totalSharedCount - a.totalSharedCount;
  });

  return { duplicateRows };
}
