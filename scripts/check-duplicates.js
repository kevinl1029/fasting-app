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
    
    // Extract variable declarations with line numbers
    const declarations = [];
    const variablePattern = /(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    
    lines.forEach((line, index) => {
        // If changedLines is provided, only check those lines for efficiency
        if (changedLines && !changedLines.includes(index + 1)) {
            return;
        }
        
        let match;
        while ((match = variablePattern.exec(line)) !== null) {
            declarations.push({
                name: match[1],
                line: index + 1,
                content: line.trim()
            });
        }
        variablePattern.lastIndex = 0; // Reset for next line
    });
    
    // Find duplicates
    const nameCount = {};
    const duplicates = [];
    
    declarations.forEach(decl => {
        if (nameCount[decl.name]) {
            nameCount[decl.name].push(decl);
        } else {
            nameCount[decl.name] = [decl];
        }
    });
    
    Object.entries(nameCount).forEach(([name, occurrences]) => {
        if (occurrences.length > 1) {
            duplicates.push({ name, occurrences });
        }
    });
    
    return {
        duplicates,
        totalDeclarations: declarations.length,
        checkedLines: changedLines ? changedLines.length : lines.length
    };
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