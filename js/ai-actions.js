/**
 * MG (Management Game) - AI行動関数
 *
 * AIターン実行、リスクカード適用、AI行動表示
 */

// ============================================
// Apply risk card to AI company
// ============================================
function applyRiskCardToAI(company, card) {
    let rowUsed = true;

    switch(card.id) {
        case 1: // クレーム発生
        case 2:
            company.cash = Math.max(0, company.cash - 5);
            if (!company.additionalFixedCost) company.additionalFixedCost = 0;
            company.additionalFixedCost += 5;  // Fに計上
            break;
        case 3: // 教育成功
        case 4:
            if (company.chips.education > 0 && company.products > 0) {
                const sellQtyEdu = Math.min(getSalesCapacity(company), company.products, 5);
                company.cash += sellQtyEdu * 32;
                company.products -= sellQtyEdu;
                company.totalSales += sellQtyEdu * 32;
                company.totalSoldQuantity = (company.totalSoldQuantity || 0) + sellQtyEdu;
                // ストッカー（海外市場）に戻す
                const overseasMktEdu = gameState.markets.find(m => m.name === '海外');
                if (overseasMktEdu) overseasMktEdu.currentStock += sellQtyEdu;
            }
            break;
        case 5: // 消費者運動発生
        case 6:
            company.cannotSell = true;
            break;
        case 7: // 得意先倒産
        case 8:
            if (gameState.currentPeriod !== 2) {
                company.cash = Math.max(0, company.cash - 30);
                company.specialLoss = (company.specialLoss || 0) + 30;
            }
            break;
        case 9: // 研究開発失敗
        case 10:
        case 11:
            if (company.chips.research > 0) {
                company.chips.research--;
            } else if (company.nextPeriodChips.research > 0) {
                company.nextPeriodChips.research--;
            }
            break;
        case 12: // 広告成功
        case 13:
        case 14:
            if (company.chips.advertising > 0 && company.products > 0) {
                const maxSellAd = Math.min(company.chips.advertising * 2, 5);
                const sellQtyAd = Math.min(maxSellAd, company.products);
                company.cash += sellQtyAd * 32;
                company.products -= sellQtyAd;
                company.totalSales += sellQtyAd * 32;
                company.totalSoldQuantity = (company.totalSoldQuantity || 0) + sellQtyAd;
                // ストッカー（海外市場）に戻す
                const overseasMktAd = gameState.markets.find(m => m.name === '海外');
                if (overseasMktAd) overseasMktAd.currentStock += sellQtyAd;
            }
            break;
        case 15: // 労災発生
        case 16:
            company.cannotProduce = true;
            break;
        case 17: // 広告政策失敗
        case 18:
            if (company.chips.advertising > 0) {
                company.chips.advertising--;
            } else if (company.nextPeriodChips.advertising > 0) {
                company.nextPeriodChips.advertising--;
            }
            break;
        case 19: // 特別サービス
        case 20:
            // AIは材料購入を選択（5個まで1個10円）
            const buyQty = Math.min(5, Math.floor(company.cash / 10));
            if (buyQty > 0) {
                company.cash -= buyQty * 10;
                company.materials += buyQty;
            }
            break;
        case 21: // 返品発生
        case 22:
        case 23:
            if (gameState.currentPeriod !== 2) {
                company.totalSales -= 20;
                company.products++;
            }
            break;
        case 24: // コンピュータートラブル
        case 25:
            company.cash = Math.max(0, company.cash - 10);
            if (!company.additionalFixedCost) company.additionalFixedCost = 0;
            company.additionalFixedCost += 10;  // Fに計上
            break;
        case 26: // 商品の独占販売
        case 27:
        case 28:
            const sellQtyMono = Math.min(company.salesmen * 2, company.products, 5);
            if (sellQtyMono > 0) {
                company.cash += sellQtyMono * 32;
                company.products -= sellQtyMono;
                company.totalSales += sellQtyMono * 32;
                company.totalSoldQuantity = (company.totalSoldQuantity || 0) + sellQtyMono;
                // ストッカー（海外市場）に戻す
                const overseasMktMono = gameState.markets.find(m => m.name === '海外');
                if (overseasMktMono) overseasMktMono.currentStock += sellQtyMono;
            }
            break;
        case 29: // 製造ミス発生
        case 30:
            if (company.wip > 0) {
                company.wip--;
                company.specialLoss = (company.specialLoss || 0) + 14;
            }
            break;
        case 31: // 倉庫火災
        case 32:
            {
                const lostMaterials = company.materials;
                const materialValue = lostMaterials * 13;
                if (company.chips.insurance > 0) {
                    const compensation = lostMaterials * 8;
                    company.cash += compensation;
                    company.chips.insurance = 0;
                    company.specialLoss = (company.specialLoss || 0) + (materialValue - compensation);
                } else {
                    company.specialLoss = (company.specialLoss || 0) + materialValue;
                }
                company.materials = 0;
            }
            break;
        case 33: // 縁故採用（強制実行）
        case 34:
            {
                const hireCost = 5;
                // 現金不足の場合、材料売却→短期借入で対応
                if (company.cash < hireCost) {
                    // 1. 材料売却（10円/個）
                    while (company.cash < hireCost && company.materials > 0) {
                        company.materials--;
                        company.cash += 10;
                    }
                    // 2. それでも足りなければ短期借入
                    if (company.cash < hireCost) {
                        const shortage = hireCost - company.cash;
                        // 短期借入: 借入額の80%を受け取る（20%は今期の金利）
                        const loanNeeded = Math.ceil(shortage / 0.8);
                        company.shortLoans += loanNeeded;
                        const shortInterestPaid = Math.floor(loanNeeded * 0.2);
                        company.cash += loanNeeded - shortInterestPaid;
                        // 新規借入金利をトラッキング（F計算用）
                        company.newLoanInterest = (company.newLoanInterest || 0) + shortInterestPaid;
                    }
                }
                company.cash -= hireCost;
                company.extraLaborCost = (company.extraLaborCost || 0) + hireCost;
                // AIはランダムでワーカーかセールスマンを追加
                if (Math.random() > 0.5) {
                    company.workers++;
                } else {
                    company.salesmen++;
                }
            }
            break;
        case 35: // 研究開発成功
        case 36:
        case 37:
        case 38:
        case 39:
        case 40:
            if (company.chips.research > 0 && company.products > 0) {
                const salesCapacity = getSalesCapacity(company);
                const sellQty = Math.min(company.chips.research * 2, company.products, salesCapacity, 5);
                company.cash += sellQty * 32;
                company.products -= sellQty;
                company.totalSales += sellQty * 32;
                company.totalSoldQuantity = (company.totalSoldQuantity || 0) + sellQty;
            }
            break;
        case 41: // 各社共通
        case 42:
            executeAllCompaniesCommonPurchaseFromAI(company);
            return;
        case 43: // ストライキ発生（行を消費しないが休みではない）
        case 44:
            rowUsed = false;
            break;
        case 45: // 盗難発見
        case 46:
            {
                const stolen = Math.min(2, company.products);
                const productValue = stolen * 15;
                if (company.chips.insurance > 0) {
                    const compensation = stolen * 10;
                    company.cash += compensation;
                    company.chips.insurance = 0;
                    company.specialLoss = (company.specialLoss || 0) + (productValue - compensation);
                } else {
                    company.specialLoss = (company.specialLoss || 0) + productValue;
                }
                company.products -= stolen;
                const overseasMarket = gameState.markets.find(m => m.name === '海外');
                if (overseasMarket) overseasMarket.currentStock += stolen;
            }
            break;
        case 47: // 長期労務紛争
        case 48:
            company.skipTurns = 1;
            rowUsed = false;
            break;
        case 49: // 設計トラブル発生
        case 50:
            company.cash = Math.max(0, company.cash - 10);
            if (!company.additionalFixedCost) company.additionalFixedCost = 0;
            company.additionalFixedCost += 10;  // Fに計上
            break;
        case 51: // ワーカー退職
        case 52:
            company.cash = Math.max(0, company.cash - 5);
            company.extraLaborCost = (company.extraLaborCost || 0) + 5;  // 人件費
            if (company.workers > 0) {
                company.workers--;
                company.retiredWorkers = (company.retiredWorkers || 0) + 1;  // 退職者追跡
            }
            break;
        case 53: // 景気変動
        case 54:
            gameState.turnReversed = !gameState.turnReversed;
            break;
        case 55: // 教育失敗
        case 56:
            if (company.chips.education > 0) {
                company.chips.education--;
            } else if (company.nextPeriodChips.education > 0) {
                company.nextPeriodChips.education--;
            }
            break;
        case 57: // セールスマン退職
        case 58:
            company.cash = Math.max(0, company.cash - 5);
            company.extraLaborCost = (company.extraLaborCost || 0) + 5;  // 人件費
            if (company.salesmen > 0) {
                company.salesmen--;
                company.retiredSalesmen = (company.retiredSalesmen || 0) + 1;  // 退職者追跡
            }
            break;
        case 59: // 社長、病気で倒れる（行を消費しないが休みではない）
        case 60:
            rowUsed = false;
            break;
        case 61: // 不良在庫発生（保険対象外）
        case 62:
            let totalInv = company.materials + company.wip + company.products;
            if (totalInv > 20) {
                let excess = totalInv - 20;
                let lostVal = 0;
                let lostItemsAI = 0;
                if (company.products > 0 && excess > 0) {
                    const remove = Math.min(company.products, excess);
                    company.products -= remove;
                    lostVal += remove * 15;
                    lostItemsAI += remove;
                    excess -= remove;
                }
                if (company.wip > 0 && excess > 0) {
                    const remove = Math.min(company.wip, excess);
                    company.wip -= remove;
                    lostVal += remove * 14;
                    lostItemsAI += remove;
                    excess -= remove;
                }
                if (company.materials > 0 && excess > 0) {
                    const remove = Math.min(company.materials, excess);
                    company.materials -= remove;
                    lostVal += remove * 13;
                    lostItemsAI += remove;
                }
                // 失われた在庫を海外市場（ストッカー）に戻す
                const overseasMkt = gameState.markets.find(m => m.name === '海外');
                if (overseasMkt && lostItemsAI > 0) {
                    overseasMkt.currentStock += lostItemsAI;
                }
                company.specialLoss = (company.specialLoss || 0) + lostVal;
            }
            break;
        case 63: // 機械故障
        case 64:
            company.cash = Math.max(0, company.cash - 5);
            if (!company.additionalFixedCost) company.additionalFixedCost = 0;
            company.additionalFixedCost += 5;
            break;
        default:
            break;
    }

    // 行数処理（ターン進行は呼び出し元で制御）
    if (rowUsed) {
        incrementRow(gameState.companies.indexOf(company));
    }

    return rowUsed;  // 呼び出し元でターン進行を制御
}

// ============================================
// 各社共通購入（AIが引いた場合）
// ============================================

// Execute common purchase when AI draws the card
function executeAllCompaniesCommonPurchaseFromAI(aiCompany) {
    const playerCompany = gameState.companies[0];
    const canBuy1 = playerCompany.cash >= 12;
    const canBuy2 = playerCompany.cash >= 24;
    const canBuy3 = playerCompany.cash >= 36;

    const content = `
        <div class="risk-display" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-color: #a78bfa;">
            <div class="risk-badge">📦 各社共通</div>
            <div class="risk-title">${aiCompany.name}が引きました</div>
            <div class="risk-description">全社が¥12で3個まで材料を購入できます</div>
        </div>
        <div style="text-align: center; margin: 15px 0; color: #4ade80; font-weight: bold;">
            💰 現金: ¥${playerCompany.cash}　　📦 材料: ${playerCompany.materials}個
        </div>
        <p style="text-align: center; margin-bottom: 10px; color: #666;">購入する数量をタップしてください</p>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
            <div onclick="selectAICommonPurchase(0)" class="qty-card" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); border: 2px solid #9ca3af; border-radius: 10px; padding: 12px; text-align: center; cursor: pointer; color: white;">
                <div style="font-size: 24px;">🚫</div>
                <div style="font-size: 14px; font-weight: bold;">なし</div>
                <div style="font-size: 11px; color: #d1d5db;">¥0</div>
            </div>
            <div onclick="${canBuy1 ? 'selectAICommonPurchase(1)' : ''}" class="qty-card" style="background: ${canBuy1 ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : '#374151'}; border: 2px solid ${canBuy1 ? '#a78bfa' : '#4b5563'}; border-radius: 10px; padding: 12px; text-align: center; cursor: ${canBuy1 ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy1 ? '1' : '0.5'};">
                <div style="font-size: 24px;">📦</div>
                <div style="font-size: 14px; font-weight: bold;">1個</div>
                <div style="font-size: 11px; color: #d1d5db;">¥12</div>
            </div>
            <div onclick="${canBuy2 ? 'selectAICommonPurchase(2)' : ''}" class="qty-card" style="background: ${canBuy2 ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : '#374151'}; border: 2px solid ${canBuy2 ? '#a78bfa' : '#4b5563'}; border-radius: 10px; padding: 12px; text-align: center; cursor: ${canBuy2 ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy2 ? '1' : '0.5'};">
                <div style="font-size: 24px;">📦📦</div>
                <div style="font-size: 14px; font-weight: bold;">2個</div>
                <div style="font-size: 11px; color: #d1d5db;">¥24</div>
            </div>
            <div onclick="${canBuy3 ? 'selectAICommonPurchase(3)' : ''}" class="qty-card" style="background: ${canBuy3 ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : '#374151'}; border: 2px solid ${canBuy3 ? '#a78bfa' : '#4b5563'}; border-radius: 10px; padding: 12px; text-align: center; cursor: ${canBuy3 ? 'pointer' : 'not-allowed'}; color: white; opacity: ${canBuy3 ? '1' : '0.5'};">
                <div style="font-size: 24px;">📦📦📦</div>
                <div style="font-size: 14px; font-weight: bold;">3個</div>
                <div style="font-size: 11px; color: #d1d5db;">¥36</div>
            </div>
        </div>
    `;

    showModal('各社共通購入', content);

    // AI会社を一時保存
    gameState.aiCommonPurchase = aiCompany;
}

// AI版各社共通購入の数量選択
function selectAICommonPurchase(qty) {
    window.selectedAICommonQty = qty;
    processAICommonPurchase();
}

// Process AI common purchase
function processAICommonPurchase() {
    const playerQty = window.selectedAICommonQty || 0;
    const playerCompany = gameState.companies[0];
    const aiCompany = gameState.aiCommonPurchase;

    let purchaseLog = [];
    let playerPurchased = false;  // プレイヤーが実際に購入したかどうか

    // プレイヤーの購入処理
    if (playerQty > 0) {
        const cost = playerQty * 12;
        if (playerCompany.cash >= cost) {
            let purchased = 0;

            // まず市場から購入
            for (const market of gameState.markets) {
                if (purchased >= playerQty) break;
                if (market.currentStock > 0) {
                    const qty = Math.min(playerQty - purchased, market.currentStock);
                    market.currentStock -= qty;
                    purchased += qty;
                }
            }

            // 不足分は海外市場（ストッカー）から
            const overseasMarket = gameState.markets.find(m => m.name === '海外');
            if (purchased < playerQty && overseasMarket) {
                const qty = playerQty - purchased;
                overseasMarket.currentStock = Math.max(0, overseasMarket.currentStock - qty);
                purchased += qty;
            }

            playerCompany.cash -= cost;
            playerCompany.materials += playerQty;
            playerCompany.totalMaterialCost += cost;
            playerPurchased = true;  // お金の流れがあった

            // 行動ログ記録
            logAction(0, '各社共通', `¥12×${playerQty}個購入`, -cost, true);

            purchaseLog.push(`あなた: ${playerQty}個購入（¥${cost}）`);
        } else {
            purchaseLog.push('あなた: 現金不足で購入できず');
        }
    } else {
        purchaseLog.push('あなた: 購入しない');
    }

    // 全AI会社の購入処理（プロは12円で3個必ず買う）
    for (let i = 1; i < gameState.companies.length; i++) {
        const company = gameState.companies[i];
        const maxAffordable = Math.min(3, Math.floor(company.cash / 12));

        if (maxAffordable >= 2) {  // 2個以上買えるなら買う
            const aiQty = maxAffordable;
            let purchased = 0;

            // まず市場から購入
            for (const market of gameState.markets) {
                if (purchased >= aiQty) break;
                if (market.currentStock > 0) {
                    const buyQty = Math.min(aiQty - purchased, market.currentStock);
                    market.currentStock -= buyQty;
                    purchased += buyQty;
                }
            }

            // 不足分は海外市場から
            const overseasMarket = gameState.markets.find(m => m.name === '海外');
            if (purchased < aiQty && overseasMarket) {
                const buyQty = aiQty - purchased;
                overseasMarket.currentStock = Math.max(0, overseasMarket.currentStock - buyQty);
                purchased += buyQty;
            }

            if (purchased > 0) {
                const aiCost = purchased * 12;
                company.cash -= aiCost;
                company.materials += purchased;
                company.totalMaterialCost += aiCost;

                // 行動ログ記録（AI）
                logAction(i, '各社共通', `¥12×${purchased}個購入`, -aiCost, false);

                purchaseLog.push(`${company.name}: ${purchased}個購入（¥${aiCost}）`);
            }
        }
    }

    closeModal();
    updateDisplay();

    // 購入結果を表示
    alert('【各社共通購入結果】\n' + purchaseLog.join('\n'));

    // AIのターンを終了
    gameState.aiCommonPurchase = null;

    // プレイヤーが購入した場合のみ1行使用（お金の流れがあった場合）
    if (playerPurchased) {
        endTurn();
    } else {
        nextTurn();
    }
}

// ============================================
// AI行動表示モーダル
// ============================================

function showAIActionModal(company, actionType, actionIcon, actionDetail, resultData = null, cashChange = 0) {
    // AI行動をactionLogに記録
    const companyIndex = gameState.companies.indexOf(company);
    if (companyIndex >= 0) {
        // resultDataからcashChangeを推測（費用項目がある場合）
        if (cashChange === 0 && resultData) {
            resultData.forEach(row => {
                if (row.value && typeof row.value === 'string') {
                    const match = row.value.match(/[¥￥](-?\d+)/);
                    if (match) {
                        const val = parseInt(match[1]);
                        if (row.label.includes('費') || row.label.includes('コスト')) {
                            cashChange -= val;
                        } else if (row.label.includes('収入') || row.label.includes('売上')) {
                            cashChange += val;
                        }
                    }
                }
            });
        }
        logAction(companyIndex, actionType, actionDetail, cashChange, true);
    }

    const companyEmojis = {
        'A社': '🅰️', 'B社': '🅱️', 'C社': '©️', 'D社': '🇩', 'E社': '🇪'
    };

    let resultHtml = '';
    if (resultData) {
        resultHtml = '<div class="ai-action-result">';
        resultData.forEach(row => {
            resultHtml += `<div class="ai-action-result-row ${row.highlight ? 'highlight' : ''}">
                <span>${row.label}</span>
                <span>${row.value}</span>
            </div>`;
        });
        resultHtml += '</div>';
    }

    const modalHtml = `
        <div class="ai-action-modal" id="aiActionModal">
            <div class="ai-action-header">
                <div class="ai-action-avatar">${companyEmojis[company.name] || '🏢'}</div>
                <div class="ai-action-company-info">
                    <div class="ai-action-company-name">${company.name}</div>
                    <div class="ai-action-company-cash">現金: ¥${company.cash}</div>
                </div>
            </div>
            <div class="ai-action-body">
                <div class="ai-action-icon">${actionIcon}</div>
                <div class="ai-action-type">${actionType}</div>
                <div class="ai-action-detail">${actionDetail}</div>
                ${resultHtml}
            </div>
            <button class="ai-action-continue-btn" onclick="closeAIActionModal()">OK</button>
        </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHtml;
}

// AI行動モーダルを閉じて次のターンへ
function closeAIActionModal() {
    // フリーズ防止タイムアウトをクリア
    if (window.currentAITurnTimeout) {
        clearTimeout(window.currentAITurnTimeout);
        window.currentAITurnTimeout = null;
    }
    document.getElementById('modalContainer').innerHTML = '';

    // 期末処理中の場合は次のターンへ進まない
    if (gameState.periodEnding) {
        console.log('Period is ending - not proceeding to next turn');
        return;
    }

    nextTurn();
}

// ============================================
// Execute AI turn
// ============================================

function executeAITurn() {
    // プレイヤーターンの場合は実行しない（安全ガード）
    if (gameState.currentPlayerIndex === 0) {
        console.warn('executeAITurn called during player turn - aborting');
        return;
    }

    // 期末処理中の場合は実行しない
    if (gameState.periodEnding) {
        console.log('Period is ending - AI turn skipped');
        return;
    }

    const company = gameState.companies[gameState.currentPlayerIndex];

    // AIがすでに規定行数に達している場合は期を終了
    if (company.currentRow >= gameState.maxRows) {
        console.log(`${company.name}は既に規定行数に達しています。期末処理を開始します。`);
        gameState.periodEnding = true;
        showPeriodEndAnnouncement(company);
        return;
    }

    // フリーズ防止タイムアウト（15秒後に強制的に次のターンへ）
    const aiTurnTimeout = setTimeout(() => {
        console.warn(`AI turn timeout for ${company.name} - forcing next turn`);
        closeModal();
        nextTurn();
    }, 15000);

    // タイムアウトクリア用にグローバルに保存
    window.currentAITurnTimeout = aiTurnTimeout;

    if (company.skipTurns > 0) {
        company.skipTurns--;
        // タイムアウトをクリアしてから次のターンへ
        clearTimeout(aiTurnTimeout);
        window.currentAITurnTimeout = null;
        nextTurn();
        return;
    }

    // ペンディング大型機械購入（前ターンで小型売却済み）
    if (company.pendingLargeMachinePurchase) {
        if (company.cash >= 200) {
            company.cash -= 200;
            company.machines.push({ type: 'large', attachments: 0 });
            company.pendingLargeMachinePurchase = false;
            incrementRow(gameState.companies.indexOf(company));
            logAction(gameState.companies.indexOf(company), '大型機械購入', '大型機械購入 ¥200（意思決定カード）', -200, true);
            showAIActionModal(company, '大型機械購入', '🏗️', '小型売却後の大型機械購入完了', [
                { label: '投資額', value: '¥200' },
                { label: '製造能力', value: '+4' }
            ]);
            clearTimeout(aiTurnTimeout);
            window.currentAITurnTimeout = null;
            return;
        } else {
            // 現金不足で購入できない場合はフラグをクリア
            console.log(`${company.name}: 現金不足(¥${company.cash})で大型機械購入見送り`);
            company.pendingLargeMachinePurchase = false;
        }
    }

    // カードデッキから引く（プレイヤーと同様）
    if (!gameState.deckInitialized || gameState.cardDeck.length === 0) {
        initializeCardDeck();
    }

    const cardType = gameState.cardDeck.pop();
    console.log(`${company.name}がカードを引きました: ${cardType}（残り${gameState.cardDeck.length}枚）`);

    if (cardType === 'risk') {
        const availableCards = gameState.riskCards.filter(card => {
            if (gameState.currentPeriod === 2 && card.period2Exempt) return false;
            return !gameState.usedRiskCards.includes(card.id);
        });

        if (availableCards.length > 0) {
            const card = availableCards[Math.floor(Math.random() * availableCards.length)];
            gameState.usedRiskCards.push(card.id);
            console.log(`${company.name}がリスクカード「${card.name}」を引きました`);

            // 各社共通カードは専用モーダルで処理（プレイヤー入力が必要）
            if (card.id === 41 || card.id === 42) {
                applyRiskCardToAI(company, card);
                return; // 各社共通は専用モーダルで処理するのでここで終了
            }

            // Apply risk card effect to AI
            const rowUsed = applyRiskCardToAI(company, card);

            // リスクカードを引いたことを通知（行動ログに記録）
            const companyIndex = gameState.companies.indexOf(company);
            let effectDescription = card.description;

            // 特別な効果の説明を追加
            if (card.id === 15 || card.id === 16) {
                effectDescription += '（今期は生産不可）';
            } else if (card.id === 5 || card.id === 6) {
                effectDescription += '（今期は販売不可）';
            } else if (card.id === 43 || card.id === 44) {
                effectDescription += '（行消費なし）';
            } else if (card.id === 47 || card.id === 48) {
                effectDescription += '（1回休み付与、行消費なし）';
            } else if (card.id === 59 || card.id === 60) {
                effectDescription += '（行消費なし）';
            }

            logAction(companyIndex, `リスク: ${card.name}`, effectDescription, 0, rowUsed);
            showAIActionModal(company, `リスクカード: ${card.name}`, '⚠️', effectDescription);
            return; // リスクカードを引いたらターン終了
        }
        // 利用可能なリスクカードがない場合は意思決定へ
    }

    // 採用チェック（ワーカーまたはセールスマンが0人）
    if (company.workers === 0 || company.salesmen === 0) {
        // 採用を実行
        let hireWorkers = 0;
        let hireSalesmen = 0;

        if (company.workers === 0) {
            hireWorkers = 1; // 最低1人採用
        }
        if (company.salesmen === 0) {
            hireSalesmen = 1; // 最低1人採用
        }

        const cost = (hireWorkers + hireSalesmen) * 5;
        // 現金があれば採用（短期借入で購入は不可）
        if (company.cash >= cost) {
            company.cash -= cost;
            company.workers += hireWorkers;
            company.salesmen += hireSalesmen;
            incrementRow(gameState.companies.indexOf(company));

            let detail = '';
            if (hireWorkers > 0) detail += `ワーカー ${hireWorkers}人`;
            if (hireSalesmen > 0) detail += `${hireWorkers > 0 ? '、' : ''}セールスマン ${hireSalesmen}人`;

            showAIActionModal(company, '採用', '👥', detail, [
                { label: '採用費', value: `¥${cost}` }
            ]);
            return;
        }
        // 現金不足時は採用をスキップして他の行動へ
    }

    // AI性格別戦略実行
    const mfgCapacity = getManufacturingCapacity(company);
    const salesCapacity = getSalesCapacity(company);

    // AI分析データを取得
    const analysis = getAIFinancialAnalysis(company);
    executeAIStrategyByType(company, mfgCapacity, salesCapacity, analysis);
}
