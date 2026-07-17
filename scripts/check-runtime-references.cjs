const path = require('node:path');
const ts = require('typescript');

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
if (!configPath) {
  console.error('tsconfig.json not found.');
  process.exit(1);
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(ts.formatDiagnosticsWithColorAndContext([configFile.error], formatHost()));
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.dirname(configPath),
  { noEmit: true },
  configPath
);

const ignoredSegments = [
  '/scratch/',
  '/confer-ncia-de-estoque-main/',
  '/node_modules/',
  '/dist/'
];
const isIgnoredFile = fileName => {
  const normalized = fileName.replace(/\\/g, '/').toLowerCase();
  return ignoredSegments.some(segment => normalized.includes(segment));
};
const rootNames = parsed.fileNames.filter(fileName =>
  !isIgnoredFile(fileName)
);
const program = ts.createProgram({
  rootNames,
  options: parsed.options,
  projectReferences: parsed.projectReferences
});

// These diagnostics identify missing/out-of-scope names and initialization cycles
// that Vite's transpile-only production build does not report.
const runtimeDiagnosticCodes = new Set([
  2304, // Cannot find name
  2448, // Block-scoped variable used before declaration
  2451, // Cannot redeclare block-scoped variable
  2454, // Variable used before being assigned
  2456, // Type alias circularly references itself
  2552, // Cannot find name; suggested alternate name
  7022, // Implicit any caused by self-reference
  7023  // Return type implicitly any caused by recursive reference
]);

const diagnostics = [
  ...program.getSyntacticDiagnostics().filter(diagnostic =>
    !diagnostic.file || !isIgnoredFile(diagnostic.file.fileName)
  ),
  ...program.getSemanticDiagnostics().filter(diagnostic =>
    runtimeDiagnosticCodes.has(diagnostic.code) &&
    (!diagnostic.file || !isIgnoredFile(diagnostic.file.fileName))
  )
];

if (diagnostics.length > 0) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost()));
  process.exit(1);
}

console.log(`Runtime reference check passed (${rootNames.length} source files).`);

function formatHost() {
  return {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => ts.sys.newLine
  };
}
