/**
 * MG (Management Game) - 定数定義
 * ゲームで使用する全ての定数を一元管理
 */

// ============================================
// ゲーム基本設定
// ============================================

/** 各期の行数上限 */
const MAX_ROWS_BY_PERIOD = {
    2: 20,
    3: 30,
    4: 34,
    5: 35
};

/** 各期の基本人件費単価 */
const BASE_SALARY_BY_PERIOD = {
    2: 22,
    3: 24,
    4: 26,
    5: 28
};

/** 機械の減価償却費 */
const DEPRECIATION = {
    small: { period2: 6, period3plus: 13 },
    smallWithAttachment: { period2: 13, period3plus: 26 },
    large: { period2: 20, period3plus: 40 }
};

/** チップコスト */
const CHIP_COSTS = {
    normal: 20,      // 通常購入（繰り越し）
    express: 40,     // 特急購入（今期購入）
    computer: 20,
    insurance: 5
};

/** 在庫の評価単価 */
const INVENTORY_VALUES = {
    material: 13,
    wip: 14,
    product: 15
};

/** 完成・投入コスト */
const PRODUCTION_COST = 1;  // 1個あたり1円

/** 借入金利 */
const INTEREST_RATES = {
    longTerm: 0.10,   // 長期借入 10%
    shortTerm: 0.20   // 短期借入 20%
};

/** 採用費用 */
const HIRING_COSTS = {
    worker: 5,
    salesman: 5
};

/** 退職費用 */
const RETIREMENT_COST = 5;

/** 配置転換費用（1人あたり） */
const REASSIGNMENT_COST = 5;

/** 倉庫費用 */
const WAREHOUSE_COST = 20;

/** 在庫容量 */
const INVENTORY_CAPACITY = {
    base: 10,
    warehouseBonus: 12
};

// ============================================
// 市場データ
// ============================================

/** 市場定義（販売上限価格の高い順） */
const MARKETS = [
    { name: '仙台',   buyPrice: 10, sellPrice: 40, maxStock: 3,   initialStock: 3,  needsBid: true,  cssClass: 'sendai' },
    { name: '札幌',   buyPrice: 11, sellPrice: 36, maxStock: 4,   initialStock: 4,  needsBid: true,  cssClass: 'sapporo' },
    { name: '福岡',   buyPrice: 12, sellPrice: 32, maxStock: 6,   initialStock: 6,  needsBid: true,  cssClass: 'fukuoka' },
    { name: '名古屋', buyPrice: 13, sellPrice: 28, maxStock: 9,   initialStock: 9,  needsBid: true,  cssClass: 'nagoya' },
    { name: '大阪',   buyPrice: 14, sellPrice: 24, maxStock: 13,  initialStock: 13, needsBid: true,  cssClass: 'osaka' },
    { name: '東京',   buyPrice: 15, sellPrice: 20, maxStock: 20,  initialStock: 20, needsBid: false, cssClass: 'tokyo' },
    { name: '海外',   buyPrice: 16, sellPrice: 16, maxStock: 100, initialStock: 45, needsBid: false, cssClass: 'overseas' }
];

/** 市場名からインデックスを取得するマップ */
const MARKET_INDEX = {
    '仙台': 0,
    '札幌': 1,
    '福岡': 2,
    '名古屋': 3,
    '大阪': 4,
    '東京': 5,
    '海外': 6
};

// ============================================
// 意思決定カード
// ============================================

/** 意思決定カード定義 */
const DECISION_CARDS = [
    { id: 1, name: '商品販売',   description: '製品を市場に販売',               icon: '💰' },
    { id: 2, name: '材料購入',   description: '材料を市場から購入',             icon: '📦' },
    { id: 3, name: '完成・投入', description: '材料→仕掛品→製品',             icon: '🏭' },
    { id: 4, name: '採用',       description: '人材を採用（最大3名）',          icon: '👥' },
    { id: 5, name: '設備投資',   description: '機械を購入',                     icon: '⚙️' },
    { id: 6, name: 'チップ購入', description: '研究・教育・広告チップ',         icon: '🎯' },
    { id: 7, name: 'DO NOTHING', description: '何もしない（行消費なし）',       icon: '⏸️' }
];

// ============================================
// リスクカード
// ============================================

/** リスクカードタイプ */
const RISK_CARD_TYPES = {
    COST: 'cost',
    BENEFIT: 'benefit',
    SPECIAL: 'special'
};

/** リスクカード定義 */
const RISK_CARDS = [
    // クレーム発生 (1-2)
    { id: 1,  name: 'クレーム発生',           description: '本社経費▲5', type: 'cost', fCost: 5 },
    { id: 2,  name: 'クレーム発生',           description: '本社経費▲5', type: 'cost', fCost: 5 },

    // 教育成功 (3-4)
    { id: 3,  name: '教育成功',               description: '教育チップを持っていれば1個32円で販売（販売能力の範囲内、最高5個まで、仕入れ可）', type: 'benefit' },
    { id: 4,  name: '教育成功',               description: '教育チップを持っていれば1個32円で販売（販売能力の範囲内、最高5個まで、仕入れ可）', type: 'benefit' },

    // 消費者運動発生 (5-6)
    { id: 5,  name: '消費者運動発生',         description: '商品の販売はできません（材料購入、完成・投入、DO NOTHINGは可能）', type: 'cost' },
    { id: 6,  name: '消費者運動発生',         description: '商品の販売はできません（材料購入、完成・投入、DO NOTHINGは可能）', type: 'cost' },

    // 得意先倒産 (7-8)
    { id: 7,  name: '得意先倒産',             description: '現金▲30（特別損失）', type: 'cost', period2Exempt: true, cashLoss: 30 },
    { id: 8,  name: '得意先倒産',             description: '現金▲30（特別損失）', type: 'cost', period2Exempt: true, cashLoss: 30 },

    // 研究開発失敗 (9-11)
    { id: 9,  name: '研究開発失敗',           description: '青チップ1枚返却（まず会社盤から、なければ次繰盤から）', type: 'cost', returnChip: 'research' },
    { id: 10, name: '研究開発失敗',           description: '青チップ1枚返却（まず会社盤から、なければ次繰盤から）', type: 'cost', returnChip: 'research' },
    { id: 11, name: '研究開発失敗',           description: '青チップ1枚返却（まず会社盤から、なければ次繰盤から）', type: 'cost', returnChip: 'research' },

    // 広告成功 (12-14)
    { id: 12, name: '広告成功',               description: '赤チップ1枚につき2個まで空いた市場へ独占販売可能（最高5個まで、仕入れ可）', type: 'benefit' },
    { id: 13, name: '広告成功',               description: '赤チップ1枚につき2個まで空いた市場へ独占販売可能（最高5個まで、仕入れ可）', type: 'benefit' },
    { id: 14, name: '広告成功',               description: '赤チップ1枚につき2個まで空いた市場へ独占販売可能（最高5個まで、仕入れ可）', type: 'benefit' },

    // 労災発生 (15-16)
    { id: 15, name: '労災発生',               description: '生産活動はできません（材料購入、商品販売・入札、DO NOTHINGは可能）', type: 'cost', noProduction: true },
    { id: 16, name: '労災発生',               description: '生産活動はできません（材料購入、商品販売・入札、DO NOTHINGは可能）', type: 'cost', noProduction: true },

    // 広告政策失敗 (17-18)
    { id: 17, name: '広告政策失敗',           description: '赤チップ1枚返却（まず会社盤から、なければ次繰盤から）', type: 'cost', returnChip: 'advertising' },
    { id: 18, name: '広告政策失敗',           description: '赤チップ1枚返却（まず会社盤から、なければ次繰盤から）', type: 'cost', returnChip: 'advertising' },

    // 特別サービス (19-20)
    { id: 19, name: '特別サービス',           description: '材料購入→1個10で5個まで or 広告の特別サービス1個20で2個まで可', type: 'benefit' },
    { id: 20, name: '特別サービス',           description: '材料購入→1個10で5個まで or 広告の特別サービス1個20で2個まで可', type: 'benefit' },

    // 返品発生 (21-23)
    { id: 21, name: '返品発生',               description: 'ストッカーから商品1個を営業所に戻し、売上欄に（▲1個、▲20）と記入', type: 'cost', period2Exempt: true },
    { id: 22, name: '返品発生',               description: 'ストッカーから商品1個を営業所に戻し、売上欄に（▲1個、▲20）と記入', type: 'cost', period2Exempt: true },
    { id: 23, name: '返品発生',               description: 'ストッカーから商品1個を営業所に戻し、売上欄に（▲1個、▲20）と記入', type: 'cost', period2Exempt: true },

    // コンピュータートラブル (24-25)
    { id: 24, name: 'コンピュータートラブル', description: '製造経費▲10', type: 'cost', fCost: 10 },
    { id: 25, name: 'コンピュータートラブル', description: '製造経費▲10', type: 'cost', fCost: 10 },

    // 商品の独占販売 (26-28)
    { id: 26, name: '商品の独占販売',         description: 'セールスマン1人につき2個まで売れる 1個32でストッカーへ（最高5個まで 仕入れ可）', type: 'benefit' },
    { id: 27, name: '商品の独占販売',         description: 'セールスマン1人につき2個まで売れる 1個32でストッカーへ（最高5個まで 仕入れ可）', type: 'benefit' },
    { id: 28, name: '商品の独占販売',         description: 'セールスマン1人につき2個まで売れる 1個32でストッカーへ（最高5個まで 仕入れ可）', type: 'benefit' },

    // 製造ミス発生 (29-30)
    { id: 29, name: '製造ミス発生',           description: '仕掛品1個をストッカーへ', type: 'cost', loseWip: 1 },
    { id: 30, name: '製造ミス発生',           description: '仕掛品1個をストッカーへ', type: 'cost', loseWip: 1 },

    // 倉庫火災 (31-32)
    { id: 31, name: '倉庫火災',               description: '材料を全てストッカーへ 保険に加入していれば1個8の保険金が受け取れる（再加入5）', type: 'cost', loseMaterials: true, insuranceValue: 8 },
    { id: 32, name: '倉庫火災',               description: '材料を全てストッカーへ 保険に加入していれば1個8の保険金が受け取れる（再加入5）', type: 'cost', loseMaterials: true, insuranceValue: 8 },

    // 縁故採用 (33-34)
    { id: 33, name: '縁故採用',               description: '本社経費▲5', type: 'cost', hireCost: 5 },
    { id: 34, name: '縁故採用',               description: '本社経費▲5', type: 'cost', hireCost: 5 },

    // 研究開発成功 (35-40)
    { id: 35, name: '研究開発成功',           description: '青チップ1枚につき2個まで売れる 1個32でストッカーへ（販売能力の範囲内、最高5個まで 仕入れ不可）', type: 'benefit' },
    { id: 36, name: '研究開発成功',           description: '青チップ1枚につき2個まで売れる 1個32でストッカーへ（販売能力の範囲内、最高5個まで 仕入れ不可）', type: 'benefit' },
    { id: 37, name: '研究開発成功',           description: '青チップ1枚につき2個まで売れる 1個32でストッカーへ（販売能力の範囲内、最高5個まで 仕入れ不可）', type: 'benefit' },
    { id: 38, name: '研究開発成功',           description: '青チップ1枚につき2個まで売れる 1個32でストッカーへ（販売能力の範囲内、最高5個まで 仕入れ不可）', type: 'benefit' },
    { id: 39, name: '研究開発成功',           description: '青チップ1枚につき2個まで売れる 1個32でストッカーへ（販売能力の範囲内、最高5個まで 仕入れ不可）', type: 'benefit' },
    { id: 40, name: '研究開発成功',           description: '青チップ1枚につき2個まで売れる 1個32でストッカーへ（販売能力の範囲内、最高5個まで 仕入れ不可）', type: 'benefit' },

    // 各社共通 (41-42)
    { id: 41, name: '各社共通',               description: '3個までを1個12で購入可（まず市場から、不足分はストッカーから）', type: 'special' },
    { id: 42, name: '各社共通',               description: '3個までを1個12で購入可（まず市場から、不足分はストッカーから）', type: 'special' },

    // ストライキ発生 (43-44)
    { id: 43, name: 'ストライキ発生',         description: '1回休み', type: 'cost', skipTurns: 1 },
    { id: 44, name: 'ストライキ発生',         description: '1回休み', type: 'cost', skipTurns: 1 },

    // 盗難発見 (45-46)
    { id: 45, name: '盗難発見',               description: '商品を2個ストッカーへ 保険に加入していれば1個10の保険金が受け取れる（再加入5）', type: 'cost', loseProducts: 2, insuranceValue: 10 },
    { id: 46, name: '盗難発見',               description: '商品を2個ストッカーへ 保険に加入していれば1個10の保険金が受け取れる（再加入5）', type: 'cost', loseProducts: 2, insuranceValue: 10 },

    // 長期労務紛争 (47-48)
    { id: 47, name: '長期労務紛争',           description: '2回休み', type: 'cost', skipTurns: 2 },
    { id: 48, name: '長期労務紛争',           description: '2回休み', type: 'cost', skipTurns: 2 },

    // 設計トラブル発生 (49-50)
    { id: 49, name: '設計トラブル発生',       description: '製造経費▲10', type: 'cost', fCost: 10 },
    { id: 50, name: '設計トラブル発生',       description: '製造経費▲10', type: 'cost', fCost: 10 },

    // ワーカー退職 (51-52)
    { id: 51, name: 'ワーカー退職',           description: '労務費▲5', type: 'cost', workerRetires: true, fCost: 5 },
    { id: 52, name: 'ワーカー退職',           description: '労務費▲5', type: 'cost', workerRetires: true, fCost: 5 },

    // 景気変動 (53-54)
    { id: 53, name: '景気変動',               description: '逆回り', type: 'special', reverseTurn: true },
    { id: 54, name: '景気変動',               description: '逆回り', type: 'special', reverseTurn: true },

    // 教育失敗 (55-56)
    { id: 55, name: '教育失敗',               description: '黄チップ1枚返却（まず会社盤から、なければ次繰盤から）', type: 'cost', returnChip: 'education' },
    { id: 56, name: '教育失敗',               description: '黄チップ1枚返却（まず会社盤から、なければ次繰盤から）', type: 'cost', returnChip: 'education' },

    // セールスマン退職 (57-58)
    { id: 57, name: 'セールスマン退職',       description: '本社人件費▲5', type: 'cost', salesmanRetires: true, fCost: 5 },
    { id: 58, name: 'セールスマン退職',       description: '本社人件費▲5', type: 'cost', salesmanRetires: true, fCost: 5 },

    // 社長、病気で倒れる (59-60)
    { id: 59, name: '社長、病気で倒れる',     description: '1回休み', type: 'cost', skipTurns: 1 },
    { id: 60, name: '社長、病気で倒れる',     description: '1回休み', type: 'cost', skipTurns: 1 },

    // 不良在庫発生 (61-62)
    { id: 61, name: '不良在庫発生',           description: '総在庫が20個を超えるものは全てストッカーへ 1個10の保険金（製品から順に）', type: 'cost', excessInventory: true, insuranceValue: 10 },
    { id: 62, name: '不良在庫発生',           description: '総在庫が20個を超えるものは全てストッカーへ 1個10の保険金（製品から順に）', type: 'cost', excessInventory: true, insuranceValue: 10 },

    // 機械故障 (63-64)
    { id: 63, name: '機械故障',               description: '製造経費▲5', type: 'cost', fCost: 5 },
    { id: 64, name: '機械故障',               description: '製造経費▲5', type: 'cost', fCost: 5 }
];

// ============================================
// AI戦略タイプ
// ============================================

/** AI戦略タイプ */
const AI_STRATEGIES = {
    AGGRESSIVE: 'aggressive',
    BALANCED: 'balanced',
    CONSERVATIVE: 'conservative',
    PRICE_FOCUSED: 'price_focused',
    TECH_FOCUSED: 'tech_focused',
    UNPREDICTABLE: 'unpredictable'
};

/** AI戦略の説明 */
const AI_STRATEGY_DESCRIPTIONS = {
    aggressive: { name: '積極的', description: '低価格入札で量を確保、研究チップ投資優先', bidMultiplier: 0.70 },
    balanced: { name: 'バランス', description: '7割ルール徹底、バランスのよい投資', bidMultiplier: 0.80 },
    conservative: { name: '保守的', description: '安全マージン大きめ、保険チップ優先', bidMultiplier: 0.85 },
    price_focused: { name: '価格競争', description: '薄利多売、ボトルネック解消のみ投資', bidMultiplier: 0.75 },
    tech_focused: { name: '技術重視', description: '研究・教育・コンピュータチップ優先', bidMultiplier: 0.80 },
    unpredictable: { name: '予測不能', description: 'ランダムだが合理的な範囲内で行動', bidMultiplier: 0.80 }
};

/** AI会社名リスト */
const AI_COMPANY_NAMES = ['青山商事', '鈴木産業', '田中製作所', '山本工業', '佐藤物産'];

// ============================================
// 初期状態
// ============================================

/** 2期開始時の初期状態 */
const INITIAL_COMPANY_STATE = {
    cash: 112,           // 2期開始時の現金（期首処理後: 137-25=112）
    equity: 283,
    loans: 0,
    shortLoans: 0,
    currentRow: 2,       // 期首処理で1行使用済み
    materials: 1,
    wip: 2,
    products: 1,
    workers: 1,
    salesmen: 1,
    machines: [{ type: 'small', attachments: 0 }],
    warehouses: 0,
    warehouseLocation: 'materials',
    chips: {
        computer: 1,     // 期首処理で購入済み
        insurance: 1,    // 期首処理で購入済み
        research: 0,
        education: 0,
        advertising: 0
    },
    nextPeriodChips: {
        research: 0,
        education: 0,
        advertising: 0
    },
    carriedOverChips: {
        research: 0,
        education: 0,
        advertising: 0
    }
};

// ============================================
// サイコロ結果テーブル（3期以降）
// ============================================

/** サイコロ結果による大阪上限価格 */
const OSAKA_PRICE_BY_DICE = {
    1: 21,
    2: 22,
    3: 23,
    4: 24,
    5: 25,
    6: 26
};

/** サイコロ結果による人件費倍率 */
const WAGE_MULTIPLIER_BY_DICE = {
    1: 1.0,
    2: 1.0,
    3: 1.0,
    4: 1.0,
    5: 1.1,
    6: 1.2
};

// ============================================
// エクスポート（グローバルスコープ用）
// ============================================

// ブラウザのグローバルスコープで使用できるようにする
if (typeof window !== 'undefined') {
    window.MG_CONSTANTS = {
        MAX_ROWS_BY_PERIOD,
        BASE_SALARY_BY_PERIOD,
        DEPRECIATION,
        CHIP_COSTS,
        INVENTORY_VALUES,
        PRODUCTION_COST,
        INTEREST_RATES,
        HIRING_COSTS,
        RETIREMENT_COST,
        REASSIGNMENT_COST,
        WAREHOUSE_COST,
        INVENTORY_CAPACITY,
        MARKETS,
        MARKET_INDEX,
        DECISION_CARDS,
        RISK_CARD_TYPES,
        RISK_CARDS,
        AI_STRATEGIES,
        AI_STRATEGY_DESCRIPTIONS,
        AI_COMPANY_NAMES,
        INITIAL_COMPANY_STATE,
        OSAKA_PRICE_BY_DICE,
        WAGE_MULTIPLIER_BY_DICE
    };
}
