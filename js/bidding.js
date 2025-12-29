/**
 * MG (Management Game) - 入札ロジック
 *
 * 入札勝者決定の優先順位:
 * 1. コール価格が低い方が勝ち（第一優先）
 * 2. コール価格が同じなら、研究開発チップ枚数が多い方が勝ち
 * 3. それでも同じなら、親が勝ち
 *
 * 価格競争力 = 研究チップ × 2 + 親ボーナス(2)
 * コール価格 = プライスカード - 価格競争力
 * 記帳価格 = プライスカード（表示価格）
 */

const BiddingSystem = {
    /**
     * 価格競争力を計算
     * @param {Object} company - 会社オブジェクト
     * @param {boolean} isParent - 親かどうか
     * @returns {number} 価格競争力
     */
    calculateCompetitiveness: function(company, isParent) {
        const researchBonus = (company.chips.research || 0) * 2;
        const parentBonus = isParent ? 2 : 0;
        return researchBonus + parentBonus;
    },

    /**
     * コール価格を計算
     * @param {number} displayPrice - プライスカード（表示価格）
     * @param {number} competitiveness - 価格競争力
     * @returns {number} コール価格
     */
    calculateCallPrice: function(displayPrice, competitiveness) {
        return displayPrice - competitiveness;
    },

    /**
     * 入札をソート（勝者を先頭に）
     *
     * 優先順位:
     * 1. コール価格が低い方が勝ち（第一優先）
     * 2. コール価格が同じなら、研究チップ枚数が多い方が勝ち
     * 3. それでも同じなら、親が勝ち
     *
     * @param {Array} bids - 入札配列 [{company, price, displayPrice, quantity}, ...]
     * @param {Object} gameState - ゲーム状態
     * @param {number} [parentIndex] - 親の会社インデックス（省略時はgameState.currentPlayerIndex）
     * @returns {Array} ソートされた入札配列
     */
    sortBids: function(bids, gameState, parentIndex) {
        const parentCompany = (parentIndex !== undefined) ? parentIndex : gameState.currentPlayerIndex;

        return bids.sort((a, b) => {
            // 1. コール価格が低い方が勝ち（第一優先）
            if (a.price !== b.price) {
                return a.price - b.price;  // 低い方が先（昇順）
            }

            // 2. コール価格が同じなら、研究チップ枚数が多い方が勝ち
            const aCompany = gameState.companies[a.company];
            const bCompany = gameState.companies[b.company];
            const aResearch = aCompany.chips.research || 0;
            const bResearch = bCompany.chips.research || 0;
            if (aResearch !== bResearch) {
                return bResearch - aResearch;  // 多い方が先（降順）
            }

            // 3. それでも同じなら、親が勝ち
            const aIsParent = (parentCompany === a.company);
            const bIsParent = (parentCompany === b.company);
            if (aIsParent && !bIsParent) return -1;
            if (!aIsParent && bIsParent) return 1;

            return 0;
        });
    },

    /**
     * 入札を作成
     * @param {number} companyIndex - 会社インデックス
     * @param {number} displayPrice - プライスカード（表示価格）
     * @param {number} quantity - 数量
     * @param {Object} gameState - ゲーム状態
     * @returns {Object} 入札オブジェクト
     */
    createBid: function(companyIndex, displayPrice, quantity, gameState) {
        const company = gameState.companies[companyIndex];
        const isParent = (companyIndex === gameState.currentPlayerIndex);
        const competitiveness = this.calculateCompetitiveness(company, isParent);
        const callPrice = this.calculateCallPrice(displayPrice, competitiveness);

        return {
            company: companyIndex,
            price: callPrice,           // コール価格（勝敗判定用）
            displayPrice: displayPrice, // プライスカード（記帳用）
            quantity: quantity,
            competitiveness: competitiveness,
            isParent: isParent
        };
    },

    /**
     * 勝者を決定
     * @param {Array} bids - 入札配列
     * @param {Object} gameState - ゲーム状態
     * @returns {Object|null} 勝者の入札、またはnull
     */
    determineWinner: function(bids, gameState) {
        if (bids.length === 0) return null;
        const sortedBids = this.sortBids([...bids], gameState);
        return sortedBids[0];
    },

    /**
     * 入札結果の詳細を生成（表示用）
     * @param {Object} bid - 入札オブジェクト
     * @param {Object} company - 会社オブジェクト
     * @param {boolean} isWinner - 勝者かどうか
     * @returns {Object} 表示用詳細
     */
    getBidDisplayInfo: function(bid, company, isWinner) {
        const researchChips = company.chips.research || 0;

        let competitivenessBreakdown = '';
        if (researchChips > 0) {
            competitivenessBreakdown += `青${researchChips}`;
        }
        if (bid.isParent) {
            competitivenessBreakdown += (competitivenessBreakdown ? '+' : '') + '親';
        }

        return {
            companyName: company.name,
            displayPrice: bid.displayPrice,      // プライスカード
            callPrice: bid.price,                // コール価格
            quantity: bid.quantity,
            researchChips: researchChips,
            isParent: bid.isParent,
            competitiveness: bid.competitiveness,
            competitivenessBreakdown: competitivenessBreakdown,
            isWinner: isWinner
        };
    }
};

// グローバルに公開（既存コードとの互換性のため）
if (typeof window !== 'undefined') {
    window.BiddingSystem = BiddingSystem;
}
