/**
 * MG (Management Game) - ゲーム状態管理
 * ゲームの状態オブジェクトと状態管理関数
 */

// ============================================
// ゲーム状態オブジェクト
// ============================================

const gameState = {
    currentPeriod: 2,
    currentRow: 2,  // 2期は期首処理後2行目から開始
    maxRows: MAX_ROWS_BY_PERIOD[2],  // 現在の期の行数上限
    maxRowsByPeriod: MAX_ROWS_BY_PERIOD,  // 各期の行数上限
    currentPlayerIndex: 0,
    turnOrder: [],
    skipTurns: {},
    doNothingCount: {},
    usedRiskCards: [],
    usedDecisionCards: [],
    reverseOrder: false,
    turnReversed: false,  // 景気変動による逆回り
    periodStarted: false,
    waitingForBids: false,
    currentBids: [],
    bidMarkets: [],

    // 行動ログ（期末に表示）
    actionLog: [],  // {companyIndex, companyName, action, details, cashBefore, cashAfter, rowUsed}
    playerSoldInBid: null,  // 入札での販売成功フラグ

    // 市場選択モード
    salesMode: false,  // 販売モード（市場タップで販売）
    buyMode: false,    // 購入モード（市場タップで材料購入）
    twoMarketMode: false,  // 2市場販売モード ('simultaneous' or 'separate' or false)
    selectedMarkets: [],   // 2市場販売で選択された市場インデックス
    pendingSeparateBids: null, // 別々販売の入札キュー

    // 3期以降のサイコロ結果
    diceRoll: null,  // 1-6の値
    diceRolled: false,  // サイコロを振ったかどうか
    wageMultiplier: 1.0,  // 人件費倍率（1.1または1.2）
    osakaMaxPrice: 24,  // 大阪上限価格（21-26）

    // カードデッキ（75枚：60枚意思決定 + 15枚リスク）
    cardDeck: [],
    deckInitialized: false,

    // 市場データ（MARKETS定数から初期化、currentStockを追加）
    markets: MARKETS.map(m => ({
        ...m,
        currentStock: m.initialStock
    })),

    // 意思決定カード（定数から参照）
    decisionCards: DECISION_CARDS,

    // リスクカード（定数から参照 - 64枚）
    riskCards: RISK_CARDS,

    companies: []
};

// ============================================
// 状態管理ユーティリティ関数
// ============================================

/**
 * 現金不足時の処理 - まず材料を売却、次に短期借入
 * @param {Object} company - 会社オブジェクト
 * @param {number} neededAmount - 必要金額
 * @returns {Object} 実行したアクションの詳細
 */
function handleCashShortage(company, neededAmount) {
    let shortage = neededAmount - company.cash;
    if (shortage <= 0) return { materialsSold: 0, loanAmount: 0 };

    let materialsSold = 0;
    let materialRevenue = 0;

    // First, sell materials at ¥10 each to overseas market
    if (company.materials > 0 && shortage > 0) {
        const materialsToSell = Math.min(company.materials, Math.ceil(shortage / 10));
        materialsSold = materialsToSell;
        materialRevenue = materialsToSell * 10;
        company.materials -= materialsToSell;
        company.cash += materialRevenue;

        // Add to overseas market stock
        const overseasMarket = gameState.markets.find(m => m.name === '海外');
        if (overseasMarket) {
            overseasMarket.currentStock += materialsToSell;
        }

        shortage = neededAmount - company.cash;
    }

    let loanAmount = 0;

    // If still not enough, take short-term loan
    if (shortage > 0) {
        // Short-term loan: receive 80% of loan amount (20% is interest)
        loanAmount = Math.ceil(shortage / 0.8 / 50) * 50;
        company.shortLoans += loanAmount;
        const shortInterestPaid = Math.floor(loanAmount * 0.2);
        company.cash += loanAmount - shortInterestPaid;
        // Track new loan interest for F calculation
        company.newLoanInterest = (company.newLoanInterest || 0) + shortInterestPaid;
    }

    return { materialsSold, materialRevenue, loanAmount };
}

// ============================================
// 注意: 以下の関数はindex.htmlで定義されているため、ここでは定義しない
// - logAction()
// - resetActionLog()
// - initializeCardDeck()
// - initializeCompanies()
// ============================================
