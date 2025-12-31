/**
 * MG (Management Game) - セーブ・ロード機能
 *
 * ゲーム状態の保存と復元
 */

// ============================================
// セーブ・ロード機能
// ============================================
const SAVE_KEY = 'mg_game_save';

function saveGame() {
    const saveData = {
        version: 1,
        timestamp: Date.now(),
        currentPeriod: gameState.currentPeriod,
        currentRow: gameState.currentRow,
        maxRows: gameState.maxRows,
        currentPlayerIndex: gameState.currentPlayerIndex,
        turnOrder: gameState.turnOrder,
        skipTurns: gameState.skipTurns,
        doNothingCount: gameState.doNothingCount,
        usedRiskCards: gameState.usedRiskCards,
        usedDecisionCards: gameState.usedDecisionCards,
        reverseOrder: gameState.reverseOrder,
        turnReversed: gameState.turnReversed,
        periodStarted: gameState.periodStarted,
        cardDeck: gameState.cardDeck,
        deckInitialized: gameState.deckInitialized,
        markets: gameState.markets,
        companies: gameState.companies
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    console.log('ゲームを自動保存しました（期' + gameState.currentPeriod + '）');
}

function loadGame() {
    const savedData = localStorage.getItem(SAVE_KEY);
    if (!savedData) return null;
    try {
        return JSON.parse(savedData);
    } catch (e) {
        console.error('セーブデータの読み込みに失敗:', e);
        return null;
    }
}

function hasSavedGame() {
    return localStorage.getItem(SAVE_KEY) !== null;
}

function deleteSavedGame() {
    localStorage.removeItem(SAVE_KEY);
}

function restoreGame(saveData) {
    gameState.currentPeriod = saveData.currentPeriod;
    gameState.currentRow = saveData.currentRow;
    gameState.maxRows = saveData.maxRows;
    gameState.currentPlayerIndex = saveData.currentPlayerIndex;
    gameState.turnOrder = saveData.turnOrder;
    gameState.skipTurns = saveData.skipTurns;
    gameState.doNothingCount = saveData.doNothingCount;
    gameState.usedRiskCards = saveData.usedRiskCards;
    gameState.usedDecisionCards = saveData.usedDecisionCards;
    gameState.reverseOrder = saveData.reverseOrder;
    gameState.turnReversed = saveData.turnReversed;
    gameState.periodStarted = saveData.periodStarted;
    gameState.cardDeck = saveData.cardDeck;
    gameState.deckInitialized = saveData.deckInitialized;
    gameState.markets = saveData.markets;
    gameState.companies = saveData.companies;
}
