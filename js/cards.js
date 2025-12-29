/**
 * MG (Management Game) - カードロジック
 *
 * カードデッキ構成（75枚）:
 * - 意思決定カード: 60枚（7種類を各8-9枚）
 * - リスクカード: 15枚（64種類から15枚を抽選）
 *
 * 意思決定カード（7種類）:
 * 1. 商品販売   - 製品を市場に販売
 * 2. 材料購入   - 材料を市場から購入
 * 3. 完成・投入 - 材料→仕掛品→製品
 * 4. 採用       - 人材を採用（最大3名）
 * 5. 設備投資   - 機械を購入
 * 6. チップ購入 - 研究・教育・広告チップ
 * 7. DO NOTHING - 何もしない（行消費なし）
 *
 * リスクカードタイプ:
 * - cost: コスト（損失）
 * - benefit: 利益（チャンス）
 * - special: 特殊効果
 */

const CardSystem = {
    /**
     * カードデッキを初期化
     * @returns {Array} シャッフルされたカードデッキ
     */
    initializeDeck: function() {
        const deck = [];

        // 60枚の意思決定カード
        for (let i = 0; i < 60; i++) {
            deck.push({ type: 'decision' });
        }

        // 15枚のリスクカード
        for (let i = 0; i < 15; i++) {
            deck.push({ type: 'risk' });
        }

        // シャッフル（Fisher-Yates）
        return this.shuffle(deck);
    },

    /**
     * 配列をシャッフル（Fisher-Yates）
     * @param {Array} array - シャッフルする配列
     * @returns {Array} シャッフルされた配列
     */
    shuffle: function(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    },

    /**
     * デッキからカードを1枚引く
     * @param {Object} gameState - ゲーム状態
     * @returns {Object} 引いたカード {type: 'decision'|'risk', card?: Object}
     */
    drawCard: function(gameState) {
        if (gameState.cardDeck.length === 0) {
            // デッキ再生成
            gameState.cardDeck = this.initializeDeck();
        }

        const drawnCard = gameState.cardDeck.pop();

        if (drawnCard.type === 'risk') {
            // リスクカードの場合、未使用のリスクカードからランダムに選択
            const availableRiskCards = this.getAvailableRiskCards(gameState);
            if (availableRiskCards.length > 0) {
                const riskCard = availableRiskCards[Math.floor(Math.random() * availableRiskCards.length)];
                gameState.usedRiskCards.push(riskCard.id);
                return { type: 'risk', card: riskCard };
            } else {
                // 全てのリスクカードが使用済みの場合、意思決定カードとして扱う
                return { type: 'decision', card: null };
            }
        }

        return { type: 'decision', card: null };
    },

    /**
     * 利用可能なリスクカードを取得
     * @param {Object} gameState - ゲーム状態
     * @returns {Array} 利用可能なリスクカード
     */
    getAvailableRiskCards: function(gameState) {
        const riskCards = (typeof RISK_CARDS !== 'undefined') ? RISK_CARDS : [];
        const usedIds = gameState.usedRiskCards || [];
        return riskCards.filter(card => !usedIds.includes(card.id));
    },

    /**
     * リスクカードの効果を適用
     * @param {Object} card - リスクカード
     * @param {Object} company - 対象会社
     * @param {Object} gameState - ゲーム状態
     * @returns {Object} 適用結果 {success, message, effects}
     */
    applyRiskCardEffect: function(card, company, gameState) {
        const effects = [];
        let message = card.description;

        // 2期免除チェック
        if (card.period2Exempt && gameState.currentPeriod === 2) {
            return {
                success: true,
                message: '2期は免除されます',
                effects: ['exempt']
            };
        }

        // 固定費追加
        if (card.fCost) {
            company.additionalFixedCost = (company.additionalFixedCost || 0) + card.fCost;
            effects.push({ type: 'fCost', value: card.fCost });
        }

        // 現金損失
        if (card.cashLoss) {
            company.cash -= card.cashLoss;
            company.specialLoss = (company.specialLoss || 0) + card.cashLoss;
            effects.push({ type: 'cashLoss', value: card.cashLoss });
        }

        // チップ返却
        if (card.returnChip) {
            const chipType = card.returnChip;
            if (company.chips[chipType] > 0) {
                company.chips[chipType]--;
                effects.push({ type: 'returnChip', chipType: chipType, from: 'company' });
            } else if (company.nextPeriodChips && company.nextPeriodChips[chipType] > 0) {
                company.nextPeriodChips[chipType]--;
                effects.push({ type: 'returnChip', chipType: chipType, from: 'nextPeriod' });
            }
        }

        // ワーカー退職
        if (card.workerRetires && company.workers > 0) {
            company.workers--;
            company.retiredWorkers = (company.retiredWorkers || 0) + 1;
            effects.push({ type: 'workerRetires' });
        }

        // セールスマン退職
        if (card.salesmanRetires && company.salesmen > 0) {
            company.salesmen--;
            company.retiredSalesmen = (company.retiredSalesmen || 0) + 1;
            effects.push({ type: 'salesmanRetires' });
        }

        // 仕掛品損失
        if (card.loseWip && company.wip > 0) {
            const lostWip = Math.min(card.loseWip, company.wip);
            company.wip -= lostWip;
            effects.push({ type: 'loseWip', value: lostWip });
        }

        // 製品損失
        if (card.loseProducts && company.products > 0) {
            const lostProducts = Math.min(card.loseProducts, company.products);
            company.products -= lostProducts;

            // 保険金
            if (company.chips.insurance > 0 && card.insuranceValue) {
                const insurance = lostProducts * card.insuranceValue;
                company.cash += insurance;
                effects.push({ type: 'insurance', value: insurance });
            }

            effects.push({ type: 'loseProducts', value: lostProducts });
        }

        // 材料全損失（倉庫火災）
        if (card.loseMaterials && company.materials > 0) {
            const lostMaterials = company.materials;
            company.materials = 0;

            // 保険金
            if (company.chips.insurance > 0 && card.insuranceValue) {
                const insurance = lostMaterials * card.insuranceValue;
                company.cash += insurance;
                effects.push({ type: 'insurance', value: insurance });
            }

            effects.push({ type: 'loseMaterials', value: lostMaterials });
        }

        // ターンスキップ
        if (card.skipTurns) {
            company.skipTurns = (company.skipTurns || 0) + card.skipTurns;
            effects.push({ type: 'skipTurns', value: card.skipTurns });
        }

        // 生産不可フラグ
        if (card.noProduction) {
            company.noProduction = true;
            effects.push({ type: 'noProduction' });
        }

        // 逆回り
        if (card.reverseTurn) {
            gameState.turnDirection = gameState.turnDirection === 1 ? -1 : 1;
            effects.push({ type: 'reverseTurn' });
        }

        return {
            success: true,
            message: message,
            effects: effects
        };
    },

    /**
     * ベネフィットカードの効果を計算
     * @param {Object} card - リスクカード（benefitタイプ）
     * @param {Object} company - 対象会社
     * @returns {Object} 利益計算結果 {maxQty, pricePerUnit, conditions}
     */
    calculateBenefitEffect: function(card, company) {
        const result = {
            maxQty: 0,
            pricePerUnit: 32,
            conditions: [],
            canPurchase: false
        };

        // 教育成功：教育チップ保有時、販売能力内で最大5個を32円で販売
        if (card.name === '教育成功') {
            if (company.chips.education > 0) {
                const salesCapacity = company.salesmen * 2;
                result.maxQty = Math.min(5, salesCapacity);
                result.canPurchase = true;
                result.conditions.push('教育チップ保有が必要');
            }
        }

        // 研究開発成功：青チップ1枚につき2個、販売能力内で最大5個を32円で販売（仕入れ不可）
        if (card.name === '研究開発成功') {
            if (company.chips.research > 0) {
                const chipLimit = company.chips.research * 2;
                const salesCapacity = company.salesmen * 2;
                result.maxQty = Math.min(5, chipLimit, salesCapacity, company.products);
                result.canPurchase = false;
                result.conditions.push('研究チップ1枚につき2個まで', '仕入れ不可');
            }
        }

        // 広告成功：赤チップ1枚につき2個、最大5個を空いた市場へ独占販売
        if (card.name === '広告成功') {
            if (company.chips.advertising > 0) {
                const chipLimit = company.chips.advertising * 2;
                result.maxQty = Math.min(5, chipLimit);
                result.canPurchase = true;
                result.conditions.push('空いた市場のみ');
            }
        }

        // 商品の独占販売：セールスマン1人につき2個、最大5個を32円で販売
        if (card.name === '商品の独占販売') {
            const salesLimit = company.salesmen * 2;
            result.maxQty = Math.min(5, salesLimit);
            result.canPurchase = true;
        }

        return result;
    },

    /**
     * 意思決定カードのアクションリストを取得
     * @param {Object} company - 会社オブジェクト
     * @param {Object} gameState - ゲーム状態
     * @returns {Array} 利用可能なアクション
     */
    getAvailableDecisionActions: function(company, gameState) {
        const decisionCards = (typeof DECISION_CARDS !== 'undefined') ? DECISION_CARDS : [];
        const actions = [];

        decisionCards.forEach(card => {
            const action = {
                id: card.id,
                name: card.name,
                description: card.description,
                icon: card.icon,
                available: true,
                reason: ''
            };

            // 労災中は生産不可
            if (company.noProduction) {
                if (card.id === 3) { // 完成・投入
                    action.available = false;
                    action.reason = '労災発生中';
                }
            }

            // 消費者運動中は販売不可
            if (company.noSales) {
                if (card.id === 1) { // 商品販売
                    action.available = false;
                    action.reason = '消費者運動発生中';
                }
            }

            actions.push(action);
        });

        return actions;
    }
};

// グローバルに公開
if (typeof window !== 'undefined') {
    window.CardSystem = CardSystem;
}
