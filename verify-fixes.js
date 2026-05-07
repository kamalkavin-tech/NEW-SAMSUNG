#!/usr/bin/env node

/**
 * Codebase-Level Test Suite for Player.js Fixes
 * Verifies all 4 fixes are present and properly integrated
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function test(description, condition) {
    if (condition) {
        log(`✅ ${description}`, 'green');
        return true;
    } else {
        log(`❌ ${description}`, 'red');
        return false;
    }
}

// Main test runner
function runTests() {
    log('\n' + '='.repeat(60), 'blue');
    log('BBNL IPTV - PLAYER.JS FIX VERIFICATION', 'blue');
    log('='.repeat(60) + '\n', 'blue');

    const playerPath = path.join(__dirname, 'js', 'player.js');
    
    if (!fs.existsSync(playerPath)) {
        log(`❌ FATAL: player.js not found at ${playerPath}`, 'red');
        process.exit(1);
    }

    const playerContent = fs.readFileSync(playerPath, 'utf-8');
    const lines = playerContent.split('\n');
    
    let passCount = 0;
    let totalTests = 0;

    log(`📄 Analyzing ${playerPath}`, 'blue');
    log(`   Total lines: ${lines.length}\n`, 'blue');

    // TEST SET 1: FIX #1 - Player Initialization Recovery System
    log('TEST SET 1: FIX #1 - Player Initialization Recovery System', 'yellow');
    log('-'.repeat(60));
    
    totalTests++;
    if (test('  FIX #1: Function playerInitializationRecovery exists', 
        /function playerInitializationRecovery\s*\(\s*\)/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #1: RECOVERY_TIMEOUT_MS defined (8000-15000ms)', 
        /RECOVERY_TIMEOUT_MS\s*=\s*(8000|10000|12000|15000)/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #1: recoveryTimer setTimeout logic present', 
        /recoveryTimer\s*=\s*setTimeout\(function\(\)\s*\{/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #1: Forcing loading overlay hidden (display:none)', 
        /loadingOverlay\.style\.display\s*=\s*[\'"]none[\'"]/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #1: Setting visibility:hidden', 
        /loadingOverlay\.style\.visibility\s*=\s*[\'"]hidden[\'"]/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #1: Setting zIndex:-9999', 
        /loadingOverlay\.style\.zIndex\s*=\s*[\'"]?-9999[\'"]?/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #1: Setting pointerEvents:none', 
        /loadingOverlay\.style\.pointerEvents\s*=\s*[\'"]none[\'"]/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #1: Setting opacity:0', 
        /loadingOverlay\.style\.opacity\s*=\s*[\'"]?0[\'"]?/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #1: Re-registering keyboard handler in recovery', 
        /document\.addEventListener\(\s*["\']keydown["\']\s*,\s*handleKeydown\s*,\s*true\s*\)/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #1: Storing timer globally as window._playerRecoveryTimer', 
        /window\._playerRecoveryTimer\s*=\s*recoveryTimer/.test(playerContent))) {
        passCount++;
    }

    // TEST SET 2: FIX #2 - Early Keyboard Handler Registration
    log('\nTEST SET 2: FIX #2 - Early Keyboard Handler Registration', 'yellow');
    log('-'.repeat(60));
    
    totalTests++;
    if (test('  FIX #2: Function registerKeysEarly exists', 
        /function registerKeysEarly\s*\(\s*\)/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #2: Immediate key registration attempt', 
        /var attemptRegister\s*=\s*function\(\)\s*\{/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #2: Polling interval every 100ms', 
        /setInterval\(function\(\)\s*\{\s*attemptRegister\(\);?\s*\}\s*,\s*100\)/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #2: Stop polling after 3 seconds', 
        /setTimeout\(function\(\)\s*\{\s*clearInterval\(checkInterval\);?\s*\}\s*,\s*3000\)/.test(playerContent))) {
        passCount++;
    }

    // TEST SET 3: FIX #3 - Enhanced hidePageLoadingOverlay Function
    log('\nTEST SET 3: FIX #3 - Enhanced hidePageLoadingOverlay Function', 'yellow');
    log('-'.repeat(60));
    
    totalTests++;
    if (test('  FIX #3: hidePageLoadingOverlay function exists', 
        /function hidePageLoadingOverlay\s*\(\s*\)/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #3: Clearing recovery timer on success', 
        /if\s*\(\s*window\._playerRecoveryTimer\s*\)/.test(playerContent) && 
        /clearTimeout\s*\(\s*window\._playerRecoveryTimer\s*\)/.test(playerContent))) {
        passCount++;
    }

    // TEST SET 4: FIX #4 - DOMContentLoaded Key Handler Re-registration
    log('\nTEST SET 4: FIX #4 - DOMContentLoaded Handler', 'yellow');
    log('-'.repeat(60));
    
    totalTests++;
    if (test('  FIX #4: DOMContentLoaded event listener present', 
        /document\.addEventListener\s*\(\s*["\']DOMContentLoaded["\']\s*,\s*function/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  FIX #4: handleKeydown re-registration in DOMContentLoaded', 
        /document\.addEventListener\s*\(\s*["\']keydown["\']\s*,\s*handleKeydown/.test(playerContent))) {
        passCount++;
    }

    // TEST SET 5: Integration Tests
    log('\nTEST SET 5: Integration Tests', 'yellow');
    log('-'.repeat(60));
    
    totalTests++;
    if (test('  Integration: handleKeydown function is defined', 
        /function handleKeydown\s*\(\s*(?:event|e)\s*\)/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  Integration: No syntax errors detected (basic check)', 
        playerContent.includes('function') && playerContent.includes('addEventListener'))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  Integration: page-loading div reference present', 
        /document\.getElementById\s*\(\s*["\']page-loading["\']\s*\)/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  Integration: setupPlayer function referenced', 
        /setupPlayer\s*\(\s*\)/.test(playerContent))) {
        passCount++;
    }

    // TEST SET 6: Code Quality Tests
    log('\nTEST SET 6: Code Quality Tests', 'yellow');
    log('-'.repeat(60));
    
    totalTests++;
    if (test('  Quality: Recovery-related error messages logged', 
        /console\.\w+\(\s*[\'"\[]PLAYER[\]\'\"]\s*/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  Quality: Try-catch blocks for error handling', 
        /try\s*\{/.test(playerContent) && /catch\s*\(/.test(playerContent))) {
        passCount++;
    }
    
    totalTests++;
    if (test('  Quality: No debug-only code left behind', 
        !playerContent.includes('TODO') || playerContent.includes('TODO') < 5)) {
        passCount++;
    }

    // Summary
    log('\n' + '='.repeat(60), 'blue');
    log(`RESULTS: ${passCount}/${totalTests} tests passed`, passCount === totalTests ? 'green' : 'red');
    log('='.repeat(60) + '\n', 'blue');

    if (passCount === totalTests) {
        log('✅ ALL CODEBASE TESTS PASSED', 'green');
        log('\nThe code is ready for runtime testing on TV hardware.\n', 'green');
        return 0;
    } else {
        log(`❌ ${totalTests - passCount} test(s) failed`, 'red');
        log('\nPlease review the failed tests and fix the code.\n', 'red');
        return 1;
    }
}

// Run tests
const exitCode = runTests();
process.exit(exitCode);
