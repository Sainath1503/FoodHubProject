import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import xlsx from "xlsx";
import { aiLiveFlag, envExamplePath, envPath, writeAiLiveConfig } from "./aiLiveConfig.js";

const { readFile, utils, writeFile } = xlsx;

const rawValue = process.argv[2]?.toLowerCase();
if (!rawValue || !["true", "false", "1", "0", "yes", "no", "on", "off"].includes(rawValue)) {
  throw new Error("Usage: npm run ai:live -- <true|false>");
}

const enabled = ["true", "1", "yes", "on"].includes(rawValue);
writeAiLiveConfig(enabled);
updateWorkbookRunConfiguration(enabled);

console.log(`${aiLiveFlag}=${enabled}`);
console.log(`Updated ${envPath}`);
console.log(`Updated ${envExamplePath}`);
console.log("Updated qa-artifacts/FoodHub-AI-Test-Analysis.xlsx Run Configuration sheet when workbook exists.");

function updateWorkbookRunConfiguration(enabled: boolean) {
  const workbookPath = path.resolve("qa-artifacts", "FoodHub-AI-Test-Analysis.xlsx");
  if (!existsSync(workbookPath)) {
    return;
  }

  const workbook = readFile(workbookPath);
  const sheetName = "Run Configuration";
  const rows = workbook.Sheets[sheetName]
    ? utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets[sheetName])
    : [];

  const updatedRows = upsertRow(rows, {
    Setting: aiLiveFlag,
    Value: String(enabled),
    Purpose: "Switches real-time DeepSeek API calls on/off"
  });

  const worksheet = utils.json_to_sheet(updatedRows, { header: ["Setting", "Value", "Purpose"] });
  worksheet["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 90 }];
  workbook.Sheets[sheetName] = worksheet;
  if (!workbook.SheetNames.includes(sheetName)) {
    workbook.SheetNames.push(sheetName);
  }

  mkdirSync(path.dirname(workbookPath), { recursive: true });
  writeFile(workbook, workbookPath, { compression: true });
}

function upsertRow<T extends Record<string, string | number>>(rows: T[], row: T) {
  const index = rows.findIndex((item) => item.Setting === row.Setting);
  if (index === -1) {
    return [row, ...rows];
  }

  return rows.map((item, itemIndex) => itemIndex === index ? row : item);
}
