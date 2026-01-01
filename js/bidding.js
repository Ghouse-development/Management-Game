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

// ============================================
// 単一市場入札モーダル
// ============================================

// Show other players bid modal
function showOtherPlayersBidModal(market, marketIndex) {
    const content = `
        <div class="bid-display">
            <div class="bid-title">他社の入札参加</div>
            <p>市場: ${market.name} (最大価格: ¥${market.sellPrice})</p>
            <p>あなたの入札: ¥${gameState.pendingBid.displayPrice || gameState.pendingBid.price} × ${gameState.pendingBid.quantity}個</p>
            <p style="color: #666; font-size: 12px;">他社も入札に参加します（金額は非公開）</p>
            <button class="submit-btn" onclick="processBidsWithAllCompanies(${marketIndex})">入札結果を確認</button>
            <button class="cancel-btn" onclick="cancelPlayerBid()" style="margin-top: 10px;">入札に参加しない</button>
        </div>
    `;

    showModal('入札参加確認', content);
}

// Cancel player bid
function cancelPlayerBid() {
    gameState.pendingBid = null;
    closeModal();
    showToast('入札への参加を取りやめました', 'info', 3000);
    nextTurn();
}

// Process bids with all companies
function processBidsWithAllCompanies(marketIndex) {
    const market = gameState.markets[marketIndex];
    const allBids = [gameState.pendingBid];

    // AI companies also bid
    for (let i = 1; i < gameState.companies.length; i++) {
        const aiCompany = gameState.companies[i];
        if (aiCompany.products > 0) {
            const aiSalesCapacity = getSalesCapacity(aiCompany);
            const aiQuantity = Math.min(aiSalesCapacity, aiCompany.products);
            if (aiQuantity > 0) {
                const isAIParent = (gameState.currentPlayerIndex === i);
                const basePrice = Math.max(26, Math.floor(market.sellPrice * (0.85 + Math.random() * 0.10)));
                const aiDisplayPrice = Math.min(basePrice, market.sellPrice);
                const aiPrice = aiDisplayPrice - getPriceCompetitiveness(aiCompany, i); // 正しくcompanyIndexを渡す
                allBids.push({
                    company: i,
                    price: aiPrice,
                    quantity: aiQuantity,
                    displayPrice: aiDisplayPrice
                });
            }
        }
    }

    BiddingSystem.sortBids(allBids, gameState);

    const parentBid = allBids.find(b => b.company === gameState.currentPlayerIndex);
    const parentQuantity = parentBid ? parentBid.quantity : (gameState.pendingBid ? gameState.pendingBid.quantity : 3);
    let remainingCapacity = Math.min(parentQuantity, market.maxStock - market.currentStock);
    let salesResults = [];

    for (const bid of allBids) {
        if (remainingCapacity <= 0) break;

        const bidCompany = gameState.companies[bid.company];
        const bidderSalesCapacity = getSalesCapacity(bidCompany);
        const actualQty = Math.min(remainingCapacity, bidCompany.products, bidderSalesCapacity);

        if (actualQty > 0) {
            const salePrice = bid.displayPrice || bid.price;
            const revenue = salePrice * actualQty;
            bidCompany.cash += revenue;
            bidCompany.products -= actualQty;
            bidCompany.totalSales += revenue;
            bidCompany.totalSoldQuantity = (bidCompany.totalSoldQuantity || 0) + actualQty;
            market.currentStock += actualQty;
            remainingCapacity -= actualQty;

            bidCompany.currentRow++;
            bidCompany.rowsUsed++;

            logAction(bid.company, '商品販売', `${market.name}に¥${salePrice}×${actualQty}個`, revenue, true);

            salesResults.push({
                company: bidCompany,
                quantity: actualQty,
                price: salePrice,
                bid: bid
            });

            AIBrain.recordBidResult(salePrice, true, market.name);
            AIBrain.recordBidSuccess(salePrice, true);
        }
    }

    // 🔥 AI感情更新（入札結果に基づく）
    const winnerIndex = salesResults.length > 0 ? salesResults[0].bid.company : -1;
    const winningPrice = salesResults.length > 0 ? salesResults[0].price : 0;
    allBids.forEach(bid => {
        if (bid.company > 0) {  // AIのみ
            const won = salesResults.some(r => r.bid.company === bid.company);
            AIBrain.updateEmotionsFromBidResult(bid.company, won, winnerIndex, bid.price, winningPrice);
        }
    });

    let bidResultHtml = `<div style="text-align: center; margin-bottom: 10px;">
        <div style="font-size: 14px; color: #666;">📍 ${market.name}市場</div>
    </div>`;

    bidResultHtml += '<div class="bid-arena">';

    allBids.forEach((bid, index) => {
        const bidCompany = gameState.companies[bid.company];
        const researchChips = bidCompany.chips.research || 0;
        const isParent = (gameState.currentPlayerIndex === bid.company);
        const callPrice = bid.price;
        const displayPrice = bid.displayPrice || bid.price;
        const isWinner = (index === 0);
        const bidderSalesCapacity = getSalesCapacity(bidCompany);
        const availableToSell = Math.min(bidCompany.products, bidderSalesCapacity);

        let compStr = '';
        if (researchChips > 0) compStr += `青${researchChips}`;
        if (isParent) compStr += (compStr ? '+' : '') + '親';

        bidResultHtml += `
            <div class="bid-player">
                <div class="bid-player-name ${isParent ? 'is-parent' : ''}">${bidCompany.name}</div>
                <div class="price-card">
                    <div class="price-card-yen">¥</div>
                    <div class="price-card-value">${displayPrice}</div>
                </div>
                <div class="call-bubble ${isWinner ? 'winner' : ''}">¥${callPrice}</div>
                <div class="bid-quantity" style="font-size: 10px; color: #666; margin-top: 3px;">📦${availableToSell}個可</div>
                ${compStr ? `<div class="bid-competitiveness">${compStr}</div>` : ''}
            </div>
        `;
    });

    bidResultHtml += '</div>';

    if (salesResults.length > 0) {
        const winner = salesResults[0];
        const winnerRecordPrice = winner.bid.displayPrice || winner.bid.price;
        bidResultHtml += `
            <div class="bid-result-summary">
                <div class="bid-winner-announce">🏆 ${winner.company.name} の勝ち！</div>
                <div class="bid-record-price">記帳: ¥${winnerRecordPrice} × ${winner.quantity}個 = ¥${winnerRecordPrice * winner.quantity}</div>
            </div>
        `;

        if (salesResults.length > 1) {
            bidResultHtml += '<div style="margin-top: 10px; padding: 8px; background: #f3f4f6; border-radius: 6px;">';
            bidResultHtml += '<div style="font-size: 11px; color: #666; margin-bottom: 5px;">残枠販売:</div>';
            salesResults.slice(1).forEach(result => {
                const recordPrice = result.bid.displayPrice || result.bid.price;
                bidResultHtml += `<div style="font-size: 12px;">${result.company.name}: ¥${recordPrice} × ${result.quantity}個</div>`;
            });
            bidResultHtml += '</div>';
        }
    }

    const unsoldBids = allBids.filter(bid => !salesResults.some(result => result.bid === bid));
    if (unsoldBids.length > 0) {
        bidResultHtml += '<div style="margin-top: 10px; font-size: 11px; color: #9ca3af; text-align: center;">';
        bidResultHtml += '市場枠なし: ' + unsoldBids.map(b => gameState.companies[b.company].name).join(', ');
        bidResultHtml += '</div>';
    }

    closeModal();
    showModal('入札結果', bidResultHtml + '<button class="submit-btn" onclick="completeSale()">OK</button>');

    const playerResult = salesResults.find(r => r.bid.company === 0);
    if (playerResult) {
        gameState.lastSaleInfo = `【入札結果】\nあなたは${market.name}に${playerResult.quantity}個を¥${playerResult.price * playerResult.quantity}で販売しました`;
        gameState.playerSoldInBid = true;
    } else {
        gameState.lastSaleInfo = `【入札結果】\n${market.name}への入札は他社に負けました`;
        gameState.playerSoldInBid = false;
    }

    gameState.pendingBid = null;
}

// ============================================
// 2市場同時入札
// ============================================

function showOtherPlayersBidModalTwoMarket() {
    const market1 = gameState.markets[gameState.selectedMarkets[0]];
    const market2 = gameState.markets[gameState.selectedMarkets[1]];
    const maxPrice = Math.min(market1.sellPrice, market2.sellPrice);

    const content = `
        <div class="bid-display">
            <div class="bid-title">2市場同時入札 - 他社参加</div>
            <p>市場: ${market1.name} + ${market2.name}</p>
            <p>適用上限価格: ¥${maxPrice}</p>
            <p>あなたの入札: ¥${gameState.pendingBid.displayPrice} × ${gameState.pendingBid.quantity}個</p>
            <p style="color: #666; font-size: 12px;">他社も入札に参加します（金額は非公開）</p>
            <button class="submit-btn" onclick="processBidsWithAllCompaniesTwoMarket()">入札結果を確認</button>
            <button class="cancel-btn" onclick="cancelPlayerBidTwoMarket()" style="margin-top: 10px;">入札に参加しない</button>
        </div>
    `;

    showModal('2市場同時入札', content);
}

function cancelPlayerBidTwoMarket() {
    gameState.pendingBid = null;
    gameState.selectedMarkets = [];
    gameState.twoMarketMode = false;
    closeModal();
    showToast('入札への参加を取りやめました', 'info', 3000);
    nextTurn();
}

function processBidsWithAllCompaniesTwoMarket() {
    const market1 = gameState.markets[gameState.selectedMarkets[0]];
    const market2 = gameState.markets[gameState.selectedMarkets[1]];
    const maxPrice = Math.min(market1.sellPrice, market2.sellPrice);

    const allBids = [gameState.pendingBid];

    for (let i = 1; i < gameState.companies.length; i++) {
        const aiCompany = gameState.companies[i];
        if (aiCompany.products >= 2) {
            const aiSalesCapacity = getSalesCapacity(aiCompany);
            const aiQuantity = Math.min(aiSalesCapacity, aiCompany.products);
            if (aiQuantity >= 2) {
                const isAIParent = (gameState.currentPlayerIndex === i);
                const aiDisplayPrice = Math.max(26, Math.floor(maxPrice * (0.80 + Math.random() * 0.15)));
                const aiPrice = aiDisplayPrice - getPriceCompetitiveness(aiCompany, i); // 正しくcompanyIndexを渡す
                allBids.push({
                    company: i,
                    price: aiPrice,
                    quantity: aiQuantity,
                    displayPrice: aiDisplayPrice,
                    isTwoMarket: true
                });
            }
        }
    }

    BiddingSystem.sortBids(allBids, gameState);

    const volume1 = market1.maxStock - market1.currentStock;
    const volume2 = market2.maxStock - market2.currentStock;
    const parentBid = allBids.find(b => b.company === gameState.currentPlayerIndex);
    const parentQuantity = parentBid ? parentBid.quantity : gameState.pendingBid.quantity;
    let remainingCapacity = Math.min(parentQuantity, volume1 + volume2);
    let salesResults = [];

    for (const bid of allBids) {
        if (remainingCapacity <= 0) break;

        const bidCompany = gameState.companies[bid.company];
        const bidderSalesCapacity = getSalesCapacity(bidCompany);
        const actualQty = Math.min(remainingCapacity, bidCompany.products, bidderSalesCapacity);

        if (actualQty > 0) {
            const salePrice = bid.displayPrice || bid.price;
            const revenue = salePrice * actualQty;
            bidCompany.cash += revenue;
            bidCompany.products -= actualQty;
            bidCompany.totalSales += revenue;
            bidCompany.totalSoldQuantity = (bidCompany.totalSoldQuantity || 0) + actualQty;

            let remainingQty = actualQty;
            if (market1.currentStock < market1.maxStock && remainingQty > 0) {
                const toMarket1 = Math.min(remainingQty, market1.maxStock - market1.currentStock);
                market1.currentStock += toMarket1;
                remainingQty -= toMarket1;
            }
            if (market2.currentStock < market2.maxStock && remainingQty > 0) {
                const toMarket2 = Math.min(remainingQty, market2.maxStock - market2.currentStock);
                market2.currentStock += toMarket2;
            }

            remainingCapacity -= actualQty;

            bidCompany.currentRow++;
            bidCompany.rowsUsed++;

            logAction(bid.company, '商品販売', `${market1.name}+${market2.name}に¥${salePrice}×${actualQty}個`, revenue, true);

            salesResults.push({
                company: bidCompany,
                quantity: actualQty,
                price: salePrice,
                bid: bid
            });
        }
    }

    let bidResultHtml = '<div class="bid-display">';
    bidResultHtml += '<div class="bid-title">2市場同時入札 結果</div>';
    bidResultHtml += `<p style="margin-bottom: 10px;">${market1.name} + ${market2.name}</p>`;

    salesResults.forEach((result, index) => {
        const researchChips = result.company.chips.research || 0;
        const isParent = (gameState.currentPlayerIndex === result.bid.company);
        const bgColor = index === 0 ? '#d4edda' : '#fef3c7';
        const callPrice = result.bid.price;
        const recordPrice = result.bid.displayPrice || result.bid.price;
        const bidderSalesCapacity = getSalesCapacity(result.company);
        const availableToSell = Math.min(result.company.products + result.quantity, bidderSalesCapacity);

        bidResultHtml += `<div style="background: ${bgColor}; padding: 10px; margin: 10px 0; border-radius: 5px;">`;
        bidResultHtml += `<strong>${index === 0 ? '🏆 1位落札' : '✓ 残枠販売'}: ${result.company.name}</strong>`;
        bidResultHtml += `<span style="font-size: 11px; color: #666; margin-left: 8px;">📦${availableToSell}個可</span><br>`;
        bidResultHtml += `<div style="display: flex; gap: 15px; margin: 5px 0;">`;
        bidResultHtml += `<span style="font-size: 12px; color: #666;">コール価格: ¥${callPrice}</span>`;
        bidResultHtml += `<span style="font-size: 12px; color: #2563eb;">記帳価格: ¥${recordPrice}</span>`;
        bidResultHtml += `</div>`;
        bidResultHtml += `数量: ${result.quantity}個<br>`;
        if (researchChips > 0 || isParent) {
            bidResultHtml += '<div style="font-size: 12px; margin-top: 5px; color: #666;">【価格競争力】';
            if (researchChips > 0) bidResultHtml += ` 研究${researchChips}枚(-${researchChips * 2}円)`;
            if (isParent) bidResultHtml += ` 親(-2円)`;
            bidResultHtml += '</div>';
        }
        bidResultHtml += `<strong>売上金額: ¥${recordPrice * result.quantity}</strong>`;
        bidResultHtml += '</div>';
    });

    const unsoldBids = allBids.filter(bid => !salesResults.some(result => result.bid === bid));

    if (unsoldBids.length > 0) {
        bidResultHtml += '<div class="bid-entries">';
        bidResultHtml += '<div style="font-size: 12px; color: #666; margin-bottom: 5px;">入札したが売れなかった:</div>';
        unsoldBids.forEach((bid) => {
            const bidCompany = gameState.companies[bid.company];
            const callPrice = bid.price;
            const recordPrice = bid.displayPrice || bid.price;
            bidResultHtml += `
                <div class="bid-entry" style="color: #9ca3af; padding: 5px;">
                    <span>${bidCompany.name}</span>
                    <span style="font-size: 11px;">コール¥${callPrice} / 記帳¥${recordPrice} × ${bid.quantity}個（市場枠なし）</span>
                </div>
            `;
        });
        bidResultHtml += '</div>';
    }

    bidResultHtml += '</div>';

    closeModal();
    showModal('2市場同時入札 結果', bidResultHtml + '<button class="submit-btn" onclick="completeSaleTwoMarket()">OK</button>');

    const playerResult = salesResults.find(r => r.bid.company === 0);
    if (playerResult) {
        gameState.lastSaleInfo = `【2市場同時入札結果】\n${market1.name}+${market2.name}に${playerResult.quantity}個を¥${playerResult.price * playerResult.quantity}で販売しました`;
        gameState.playerSoldInBid = true;
    } else {
        gameState.lastSaleInfo = `【2市場同時入札結果】\n入札は他社に負けました`;
        gameState.playerSoldInBid = false;
    }

    gameState.pendingBid = null;
    gameState.selectedMarkets = [];
    gameState.twoMarketMode = false;
}

function completeSaleTwoMarket() {
    closeModal();
    updateDisplay();

    const playerSold = gameState.playerSoldInBid;
    gameState.playerSoldInBid = null;

    if (playerSold) {
        endTurn();
    } else {
        nextTurn();
    }
}

// ============================================
// AI入札への参加
// ============================================

function showAIBidNotification() {
    const bid = gameState.aiPendingBid;
    const playerCompany = gameState.companies[0];
    const playerSalesCapacity = getSalesCapacity(playerCompany);
    const playerMaxQty = Math.min(playerSalesCapacity, playerCompany.products);
    const defaultPrice = Math.floor(bid.market.sellPrice * 0.9);

    window.playerBidData = {
        qty: playerMaxQty,
        price: defaultPrice,
        maxQty: playerMaxQty,
        minPrice: 26,
        maxPrice: bid.market.sellPrice
    };

    const content = `
        <div style="padding: 8px;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 10px; border-radius: 10px; margin-bottom: 10px; text-align: center;">
                <div style="font-size: 14px; font-weight: bold;">⚔️ ${gameState.companies[bid.company].name}が入札開始！</div>
                <div style="font-size: 12px; margin-top: 4px;">📍 ${bid.market.name}（上限¥${bid.market.sellPrice}）</div>
            </div>

            <div style="background: #fef3c7; border-radius: 8px; padding: 8px; margin-bottom: 10px; text-align: center;">
                <span style="font-weight: bold; color: #92400e;">💰¥${playerCompany.cash} 📦${playerCompany.products}個 販売能力${playerSalesCapacity}</span>
            </div>

            <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-radius: 10px; padding: 10px; margin-bottom: 8px;">
                <div style="font-size: 12px; color: #1e40af; margin-bottom: 6px; text-align: center;">📦 入札数量</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button onclick="adjustPlayerBidQty(-1)" style="width: 38px; height: 38px; border-radius: 8px; border: none; background: #2563eb; color: white; font-size: 18px; cursor: pointer;">−</button>
                    <div id="playerBidQtyDisplay" style="min-width: 50px; padding: 8px; background: white; border-radius: 8px; text-align: center; font-size: 18px; font-weight: bold;">${playerMaxQty}</div>
                    <button onclick="adjustPlayerBidQty(1)" style="width: 38px; height: 38px; border-radius: 8px; border: none; background: #2563eb; color: white; font-size: 18px; cursor: pointer;">+</button>
                </div>
            </div>

            <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 10px; padding: 10px; margin-bottom: 10px;">
                <div style="font-size: 12px; color: #92400e; margin-bottom: 6px; text-align: center;">💵 入札価格</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
                    <button onclick="adjustPlayerBidPrice(-5)" style="width: 34px; height: 34px; border-radius: 6px; border: none; background: #d97706; color: white; font-size: 11px; cursor: pointer;">-5</button>
                    <button onclick="adjustPlayerBidPrice(-1)" style="width: 30px; height: 34px; border-radius: 6px; border: none; background: #f59e0b; color: white; font-size: 16px; cursor: pointer;">−</button>
                    <div id="playerBidPriceDisplay" style="min-width: 60px; padding: 8px; background: white; border-radius: 8px; text-align: center; font-size: 16px; font-weight: bold;">¥${defaultPrice}</div>
                    <button onclick="adjustPlayerBidPrice(1)" style="width: 30px; height: 34px; border-radius: 6px; border: none; background: #f59e0b; color: white; font-size: 16px; cursor: pointer;">+</button>
                    <button onclick="adjustPlayerBidPrice(5)" style="width: 34px; height: 34px; border-radius: 6px; border: none; background: #d97706; color: white; font-size: 11px; cursor: pointer;">+5</button>
                </div>
                <div style="font-size: 10px; color: #92400e; text-align: center; margin-top: 4px;">¥26～¥${bid.market.sellPrice}</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <button class="submit-btn" onclick="processAIBidWithPlayer()" style="padding: 12px;">⚔️ 参加する</button>
                <button class="cancel-btn" onclick="skipPlayerBid()" style="padding: 12px;">🚫 見送り</button>
            </div>
        </div>
    `;

    showModal('他社入札への参加', content);
}

function adjustPlayerBidQty(delta) {
    const data = window.playerBidData;
    data.qty = Math.max(0, Math.min(data.qty + delta, data.maxQty));
    document.getElementById('playerBidQtyDisplay').textContent = data.qty;
}

function adjustPlayerBidPrice(delta) {
    const data = window.playerBidData;
    data.price = Math.max(data.minPrice, Math.min(data.price + delta, data.maxPrice));
    document.getElementById('playerBidPriceDisplay').textContent = '¥' + data.price;
}

function processAIBidWithPlayer() {
    const bid = gameState.aiPendingBid;
    const data = window.playerBidData || { qty: 0, price: 26 };
    const playerPrice = data.price;
    const playerQty = data.qty;

    const allBids = [];

    const aiCompany = gameState.companies[bid.company];
    const aiCompetitiveness = getPriceCompetitiveness(aiCompany);
    allBids.push({
        company: bid.company,
        price: bid.price,
        displayPrice: bid.price + aiCompetitiveness,
        quantity: bid.quantity,
        competitiveness: aiCompetitiveness
    });

    if (playerQty > 0) {
        const playerCompetitiveness = getPriceCompetitiveness(gameState.companies[0]);
        allBids.push({
            company: 0,
            price: playerPrice - playerCompetitiveness,
            displayPrice: playerPrice,
            quantity: playerQty,
            competitiveness: playerCompetitiveness
        });
    }

    for (let i = 1; i < gameState.companies.length; i++) {
        if (i !== bid.company) {
            const otherCompany = gameState.companies[i];
            if (otherCompany.products > 0) {
                const otherCapacity = getSalesCapacity(otherCompany);
                const otherQty = Math.min(otherCapacity, otherCompany.products);
                if (otherQty > 0) {
                    const basePrice = Math.max(26, Math.floor(bid.market.sellPrice * (0.85 + Math.random() * 0.10)));
                    const otherDisplayPrice = Math.min(basePrice, bid.market.sellPrice);
                    const otherPrice = otherDisplayPrice - getPriceCompetitiveness(otherCompany);
                    allBids.push({company: i, price: otherPrice, quantity: otherQty, displayPrice: otherDisplayPrice});
                }
            }
        }
    }

    BiddingSystem.sortBids(allBids, gameState);

    const winner = allBids[0];
    const winCompany = gameState.companies[winner.company];
    const actualQty = Math.min(winner.quantity, bid.market.maxStock - bid.market.currentStock);

    if (actualQty > 0) {
        const salePrice = winner.displayPrice || winner.price;
        winCompany.cash += salePrice * actualQty;
        winCompany.products -= actualQty;
        winCompany.totalSales += salePrice * actualQty;
        winCompany.totalSoldQuantity = (winCompany.totalSoldQuantity || 0) + actualQty;
        bid.market.currentStock += actualQty;
    }

    const resultSalePrice = winner.displayPrice || winner.price;

    // 🔥 AI感情更新（入札結果に基づく）
    const winnerIndex = winner.company;
    allBids.forEach(b => {
        if (b.company > 0) {  // AIのみ
            const won = (b.company === winnerIndex);
            AIBrain.updateEmotionsFromBidResult(b.company, won, winnerIndex, b.price, resultSalePrice);
        }
    });

    let resultHtml = `
        <div class="bid-display">
            <div class="bid-title">入札結果</div>
            <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 15px; border-radius: 12px; margin-bottom: 15px; text-align: center;">
                <div style="font-size: 14px; opacity: 0.9;">🏆 落札者</div>
                <div style="font-size: 20px; font-weight: bold; margin: 5px 0;">${winCompany.name}</div>
                <div style="font-size: 16px;">${actualQty}個 × ¥${resultSalePrice} = <strong>¥${actualQty * resultSalePrice}</strong></div>
            </div>
            <div class="bid-entries" style="margin-bottom: 10px;">
    `;

    allBids.forEach((b, index) => {
        const isWinner = index === 0;
        const company = gameState.companies[b.company];
        const isParent = (gameState.currentPlayerIndex === b.company);
        const researchChips = company.chips.research || 0;

        let competitiveBonus = '';
        if (isParent) competitiveBonus += '親+2 ';
        if (researchChips > 0) competitiveBonus += `研究+${researchChips * 2} `;

        const effectivePrice = b.price;
        const actualPrice = b.displayPrice || (b.price + getPriceCompetitiveness(company));

        resultHtml += `
            <div class="bid-entry ${isWinner ? 'bid-winner' : ''}">
                <span>${company.name} ${isWinner ? '👑' : ''}</span>
                <span>¥${effectivePrice}（¥${actualPrice}）× ${b.quantity}個 ${competitiveBonus}</span>
            </div>
        `;
    });
    resultHtml += '</div><p style="font-size: 12px; margin-top: 10px;">※有効入札額（実際の入金額）</p></div><button class="submit-btn" onclick="continueAITurn()">OK</button>';

    closeModal();
    showModal('入札結果', resultHtml);
}

function skipPlayerBid() {
    if (window.playerBidData) {
        window.playerBidData.qty = 0;
    }
    processAIBidWithPlayer();
}

function continueAITurn() {
    if (window.currentAITurnTimeout) {
        clearTimeout(window.currentAITurnTimeout);
        window.currentAITurnTimeout = null;
    }
    closeModal();
    const company = gameState.companies[gameState.aiPendingBid.company];
    const companyIndex = gameState.companies.indexOf(company);
    gameState.aiPendingBid = null;

    if (incrementRow(companyIndex)) {
        return;
    }
    nextTurn();
}
