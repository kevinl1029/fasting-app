#!/usr/bin/env node

/**
 * Efficient duplicate variable detection for JavaScript files
 * Focuses on newly introduced declarations to avoid repeated full scans
 */

const fs = require('fs');
const path = require('path');

function checkDuplicateVariables(filePath, changedLines = null) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Track scope depth using brace counting and function detection
    const scopes = [];
    const declarations = [];
    const variablePattern = /(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;

    lines.forEach((line, index) => {
        // If changedLines is provided, only check those lines for efficiency
        if (changedLines && !changedLines.includes(index + 1)) {
            return;
        }

        const lineNumber = index + 1;
        const trimmedLine = line.trim();

        // Track scope changes by counting braces and detecting function boundaries
        let currentScopeId = getCurrentScopeId(lines, index);

        // Extract variable declarations
        let match;
        while ((match = variablePattern.exec(line)) !== null) {
            declarations.push({
                name: match[1],
                line: lineNumber,
                content: trimmedLine,
                scopeId: currentScopeId
            });
        }
        variablePattern.lastIndex = 0; // Reset for next line
    });

    // Find duplicates within the same scope
    const scopedDeclarations = {};
    const duplicates = [];

    declarations.forEach(decl => {
        const key = `${decl.name}_${decl.scopeId}`;
        if (scopedDeclarations[key]) {
            scopedDeclarations[key].push(decl);
        } else {
            scopedDeclarations[key] = [decl];
        }
    });

    Object.entries(scopedDeclarations).forEach(([key, occurrences]) => {
        if (occurrences.length > 1) {
            const name = key.split('_')[0];
            duplicates.push({ name, occurrences });
        }
    });

    return {
        duplicates,
        totalDeclarations: declarations.length,
        checkedLines: changedLines ? changedLines.length : lines.length
    };
}

function getCurrentScopeId(lines, currentIndex) {
    // Simple scope detection: find the nearest function declaration above this line
    let nearestFunctionLine = 0;

    // Look backwards from current line to find the most recent function declaration
    for (let i = currentIndex; i >= 0; i--) {
        const line = lines[i].trim();

        // Check for function declarations, arrow functions, callbacks
        if (line.match(/(?:function\s+\w+|async\s+function\s+\w+|\w+\s*:\s*(?:async\s+)?function|\.\s*then\s*\(|\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>|setInterval\s*\()/)) {
            nearestFunctionLine = i + 1;
            break;
        }

        // If we hit a closing brace at the start of a line, we might be exiting a function
        if (line.startsWith('}') && line.trim() === '}') {
            // Look for the matching opening brace
            let braceCount = 1;
            for (let j = i - 1; j >= 0; j--) {
                const prevLine = lines[j];
                braceCount += (prevLine.match(/\}/g) || []).length;
                braceCount -= (prevLine.match(/\{/g) || []).length;

                if (braceCount === 0) {
                    // Found matching opening brace - check if it's a function
                    if (prevLine.includes('function') || prevLine.includes('=>')) {
                        break; // Stop here, we're outside this function
                    }
                    break;
                }
            }
        }
    }

    return nearestFunctionLine > 0 ? `func_${nearestFunctionLine}` : 'global';
}

// Main execution
function main() {
    const args = process.argv.slice(2);
    const filePath = args[0] || './public/timer.html';
    
    // Parse changed lines if provided (format: "1,5,10-15")
    let changedLines = null;
    if (args[1]) {
        changedLines = [];
        args[1].split(',').forEach(range => {
            if (range.includes('-')) {
                const [start, end] = range.split('-').map(n => parseInt(n));
                for (let i = start; i <= end; i++) {
                    changedLines.push(i);
                }
            } else {
                changedLines.push(parseInt(range));
            }
        });
    }
    
    console.log(`🔍 Checking for duplicate variable declarations in: ${filePath}`);
    if (changedLines) {
        console.log(`📍 Focusing on ${changedLines.length} changed lines`);
    }
    
    try {
        const result = checkDuplicateVariables(filePath, changedLines);
        
        if (result.duplicates.length === 0) {
            console.log('✅ No duplicate variable declarations found!');
            console.log(`   Checked ${result.totalDeclarations} declarations across ${result.checkedLines} lines`);
        } else {
            console.log(`❌ Found ${result.duplicates.length} duplicate variable(s):`);
            result.duplicates.forEach(dup => {
                console.log(`\n   Variable: "${dup.name}"`);
                dup.occurrences.forEach(occ => {
                    console.log(`     Line ${occ.line}: ${occ.content}`);
                });
            });
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error checking file:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { checkDuplicateVariables };