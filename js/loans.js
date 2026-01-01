/**
 * MG (Management Game) - 借入・返済関連関数
 *
 * 期首借入処理、期末返済処理、AI借入ロジック
 */

// ============================================
// 期首倉庫購入オプション（3期以降）
// ============================================
window.periodStartWarehousePurchase = false;  // 期首倉庫購入フラグ

function getWarehousePeriodStartOption() {
    const player = gameState.companies[0];
    const currentWarehouses = player.warehouses || 0;

    if (currentWarehouses >= 2) {
        return ''; // 既に2個持っている
    }

    const canAfford = player.cash >= WAREHOUSE_COST;
    const warehouseCount = 2 - currentWarehouses; // 購入可能数

    return `
        <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); border-radius: 12px; padding: 12px; margin-bottom: 15px; color: white;">
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">🏪 無災害倉庫購入（期首）</div>
            <div style="font-size: 12px; margin-bottom: 8px;">
                容量+12個、火災/盗難回避、F+20円<br>
                <span style="opacity: 0.8;">※期首購入は2行目にまとめられます（追加行なし）</span>
            </div>
            <div style="display: flex; gap: 8px; justify-content: center;">
                <button onclick="togglePeriodStartWarehouse(false)" id="wh-no" style="background: ${!window.periodStartWarehousePurchase ? '#fff' : 'rgba(255,255,255,0.3)'}; color: ${!window.periodStartWarehousePurchase ? '#059669' : '#fff'}; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold;">
                    買わない
                </button>
                ${canAfford ? `
                <button onclick="togglePeriodStartWarehouse(true)" id="wh-yes" style="background: ${window.periodStartWarehousePurchase ? '#fff' : 'rgba(255,255,255,0.3)'}; color: ${window.periodStartWarehousePurchase ? '#059669' : '#fff'}; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold;">
                    購入する（¥${WAREHOUSE_COST}）
                </button>
                ` : `<span style="font-size: 11px; opacity: 0.7;">資金不足</span>`}
            </div>
            ${currentWarehouses === 0 && canAfford ? `
            <div id="wh-location-select" style="margin-top: 10px; display: ${window.periodStartWarehousePurchase ? 'block' : 'none'};">
                <div style="font-size: 11px; margin-bottom: 5px;">設置場所:</div>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button onclick="selectPeriodStartWarehouseLocation('materials')" id="wh-loc-mat" style="background: rgba(255,255,255,0.9); color: #7c3aed; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;">
                        📦 材料置場
                    </button>
                    <button onclick="selectPeriodStartWarehouseLocation('products')" id="wh-loc-prod" style="background: rgba(255,255,255,0.3); color: #fff; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px;">
                        📦 製品置場
                    </button>
                </div>
            </div>
            ` : ''}
        </div>
    `;
}

window.periodStartWarehouseLocation = 'materials';

function togglePeriodStartWarehouse(purchase) {
    window.periodStartWarehousePurchase = purchase;
    const noBtn = document.getElementById('wh-no');
    const yesBtn = document.getElementById('wh-yes');
    const locSelect = document.getElementById('wh-location-select');

    if (noBtn) {
        noBtn.style.background = !purchase ? '#fff' : 'rgba(255,255,255,0.3)';
        noBtn.style.color = !purchase ? '#059669' : '#fff';
    }
    if (yesBtn) {
        yesBtn.style.background = purchase ? '#fff' : 'rgba(255,255,255,0.3)';
        yesBtn.style.color = purchase ? '#059669' : '#fff';
    }
    if (locSelect) {
        locSelect.style.display = purchase ? 'block' : 'none';
    }
}

function selectPeriodStartWarehouseLocation(location) {
    window.periodStartWarehouseLocation = location;
    const matBtn = document.getElementById('wh-loc-mat');
    const prodBtn = document.getElementById('wh-loc-prod');

    if (matBtn) {
        matBtn.style.background = location === 'materials' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)';
        matBtn.style.color = location === 'materials' ? '#7c3aed' : '#fff';
    }
    if (prodBtn) {
        prodBtn.style.background = location === 'products' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)';
        prodBtn.style.color = location === 'products' ? '#22c55e' : '#fff';
    }
}

function processPeriodStartWarehousePurchase() {
    if (!window.periodStartWarehousePurchase) return;

    const player = gameState.companies[0];
    if (player.warehouses >= 2 || player.cash < WAREHOUSE_COST) return;

    player.cash -= WAREHOUSE_COST;
    player.warehouses++;
    if (player.warehouses === 1) {
        player.warehouseLocation = window.periodStartWarehouseLocation;
    }

    const locationName = window.periodStartWarehouseLocation === 'materials' ? '材料置場' : '製品置場';
    console.log(`[期首] ${player.name}が無災害倉庫を${locationName}に購入（¥${WAREHOUSE_COST}）`);

    // リセット
    window.periodStartWarehousePurchase = false;
}

// ============================================
// 特別ルール: 期首処理後に現金がマイナスなら100円強制借入
// ============================================
function checkEmergencyLoan() {
    gameState.companies.forEach((company, index) => {
        if (company.cash < 0) {
            // 強制100円借入（借入上限に左右されない特別ルール）
            const emergencyLoan = 100;
            const netAmount = Math.floor(emergencyLoan * 0.9);  // 90円入金（10円金利控除）

            company.loans += emergencyLoan;
            company.cash += netAmount;

            console.log(`[特別ルール] ${company.name}の現金がマイナス → 強制100円借入（入金¥${netAmount}）`);

            if (index === 0) {
                // プレイヤーに通知
                showToast(`⚠️ 現金不足のため100円を強制借入しました（入金¥${netAmount}）\n※期末返済が必要です`, 'warning', 5000);
            }
        }
    });
}

// ============================================
// 期首金利支払い
// ============================================
function processInterestPayments() {
    const interestDetails = [];

    gameState.companies.forEach(company => {
        let totalInterest = 0;
        let shortInterest = 0;
        let longInterest = 0;

        // 短期借入金利（20%）
        if (company.shortLoans > 0) {
            shortInterest = Math.floor(company.shortLoans * 0.2);
            totalInterest += shortInterest;
        }

        // 長期借入金利（10%）
        if (company.loans > 0) {
            longInterest = Math.floor(company.loans * 0.1);
            totalInterest += longInterest;
        }

        if (totalInterest > 0) {
            // 資金が足りない場合は短期借入
            if (company.cash < totalInterest) {
                const needed = Math.ceil((totalInterest - company.cash) / 0.8 / 50) * 50;
                company.shortLoans += needed;
                company.cash += needed * 0.8;  // 短期借入: 借入時20%金利控除
            }

            company.cash -= totalInterest;

            interestDetails.push({
                name: company.name,
                shortLoans: company.shortLoans,
                longLoans: company.loans,
                shortInterest: shortInterest,
                longInterest: longInterest,
                total: totalInterest
            });
        }
    });

    return interestDetails;
}

// ============================================
// 3期以降の期首借入選択UI
// ============================================
function showBorrowingChoice() {
    // 期首金利支払い処理
    const interestDetails = processInterestPayments();

    // 前期PQトップがサイコロを振る
    const diceRollerName = gameState.previousPQTopName || 'システム';
    const diceRollerPQ = gameState.previousPQTopAmount || 0;
    const isPlayerRoller = (gameState.previousPQTopIndex === 0);

    gameState.diceRoll = Math.floor(Math.random() * 6) + 1;

    // サイコロ結果に基づく設定
    if (gameState.diceRoll <= 3) {
        gameState.wageMultiplier = 1.1;
        // 仙台のみ閉鎖
        gameState.markets[0].closed = true;  // 仙台
        gameState.markets[1].closed = false; // 札幌
    } else {
        gameState.wageMultiplier = 1.2;
        // 仙台・札幌閉鎖
        gameState.markets[0].closed = true;  // 仙台
        gameState.markets[1].closed = true;  // 札幌
    }

    // 大阪上限価格（サイコロの目+20）
    gameState.osakaMaxPrice = 20 + gameState.diceRoll;
    gameState.markets[4].sellPrice = gameState.osakaMaxPrice;

    const closedMarkets = gameState.diceRoll <= 3 ? '仙台' : '仙台・札幌';

    // 金利支払い情報のHTML生成
    let interestHtml = '';
    if (interestDetails.length > 0) {
        interestHtml = `
            <div style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); border-radius: 12px; padding: 15px; margin-bottom: 15px; color: white; text-align: left;">
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; text-align: center;">💰 期首金利支払い</div>
                ${interestDetails.map(d => `
                    <div style="background: rgba(255,255,255,0.15); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">${d.name}</div>
                        <div style="font-size: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                            ${d.shortInterest > 0 ? `<div>短期金利(20%): ¥${d.shortInterest}</div>` : ''}
                            ${d.longInterest > 0 ? `<div>長期金利(10%): ¥${d.longInterest}</div>` : ''}
                        </div>
                        <div style="font-size: 13px; font-weight: bold; margin-top: 5px; text-align: right;">支払合計: ¥${d.total}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    const content = `
        <div style="text-align: center; padding: 20px;">
            <h3 style="margin-bottom: 15px;">第${gameState.currentPeriod}期開始</h3>

            ${interestHtml}

            <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 16px; padding: 20px; margin-bottom: 20px; color: white;">
                <div style="font-size: 12px; margin-bottom: 5px; opacity: 0.8;">前期PQトップ: ${diceRollerName}（¥${diceRollerPQ}）がサイコロを振りました</div>
                <div style="font-size: 14px; margin-bottom: 10px;">🎲 サイコロ結果</div>
                <div style="font-size: 48px; font-weight: bold; margin-bottom: 10px;">${gameState.diceRoll}</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 12px;">
                    <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 8px;">
                        <div style="opacity: 0.8;">市場閉鎖</div>
                        <div style="font-weight: bold;">${closedMarkets}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 8px;">
                        <div style="opacity: 0.8;">人件費倍率</div>
                        <div style="font-weight: bold;">×${gameState.wageMultiplier}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.2); padding: 8px; border-radius: 8px;">
                        <div style="opacity: 0.8;">大阪上限</div>
                        <div style="font-weight: bold;">¥${gameState.osakaMaxPrice}</div>
                    </div>
                </div>
            </div>

            <div style="background: #fef3c7; border: 2px solid #d97706; border-radius: 12px; padding: 12px; margin-bottom: 15px;">
                <div style="font-size: 13px; color: #78350f;">
                    🎲 今期のスタート順（ジャンケン代わり）: <strong>${gameState.companies[gameState.periodStartPlayerIndex || 0].name}</strong>から
                </div>
            </div>

            ${getWarehousePeriodStartOption()}

            <p style="margin-bottom: 15px;">借入を行いますか？</p>
            <button class="action-btn primary" onclick="startPeriodWithBorrowing()" style="margin: 10px;">借入を行う（3行目からスタート）</button>
            <button class="action-btn secondary" onclick="startPeriodWithoutBorrowing()" style="margin: 10px;">借入を行わない（2行目からスタート）</button>
        </div>
    `;

    showModal('期首処理 - サイコロ結果', content);
}

// ============================================
// 借入ありで期開始（3期以降）
// ============================================
function startPeriodWithBorrowing() {
    // 行動ログをリセット
    resetActionLog();

    // Auto-purchase chips for all companies first
    gameState.companies.forEach(company => {
        const computerCost = 20;
        const insuranceCost = 5;
        const totalCost = computerCost + insuranceCost;

        // 期首処理で2行使用（借入あり）→3行目から開始
        company.currentRow = 3;

        // PC・保険購入（買えない場合は買わない - 短期借入で購入は不可）
        if (company.cash >= totalCost) {
            company.cash -= totalCost;
            company.chips.computer = 1;
            company.chips.insurance = 1;
        } else if (company.cash >= computerCost) {
            company.cash -= computerCost;
            company.chips.computer = 1;
        } else if (company.cash >= insuranceCost) {
            company.cash -= insuranceCost;
            company.chips.insurance = 1;
        }
    });

    gameState.currentRow = 3;  // Start from row 3 when borrowing
    // Set maxRows based on period
    if (gameState.currentPeriod === 3) {
        gameState.maxRows = gameState.maxRowsByPeriod[3];
    } else if (gameState.currentPeriod === 4) {
        gameState.maxRows = gameState.maxRowsByPeriod[4];
    } else if (gameState.currentPeriod === 5) {
        gameState.maxRows = gameState.maxRowsByPeriod[5];
    }
    gameState.periodStarted = true;

    // プレイヤーの期首倉庫購入処理
    processPeriodStartWarehousePurchase();

    // 特別ルール: 期首処理後に現金がマイナスなら強制100円借入
    checkEmergencyLoan();

    // AI会社の長期借入処理（プレイヤーの借入モーダル表示前に処理）
    processAILongTermBorrowing();

    // AI会社の期首計画を策定
    gameState.companies.forEach((company, index) => {
        if (company.type === 'ai') {
            AIBrain.createPeriodPlan(company, index);
        }
    });
    console.log('[AI] 全AI会社の期首計画策定完了');

    closeModal();
    updateDisplay();
    showToast(`第${gameState.currentPeriod}期を開始します\n全社：コンピュータチップ(¥20)と保険チップ(¥5)を自動購入しました。\n借入を実施するため、3行目からゲームスタートです。`, 'success', 5000);
    showBorrowModal();
}

// ============================================
// 借入なしで期開始（3期以降）
// ============================================
function startPeriodWithoutBorrowing() {
    // 行動ログをリセット
    resetActionLog();

    // Auto-purchase chips for all companies first
    gameState.companies.forEach(company => {
        const computerCost = 20;
        const insuranceCost = 5;
        const totalCost = computerCost + insuranceCost;

        // 期首処理で1行使用（借入なし）→2行目から開始
        company.currentRow = 2;

        // PC・保険購入（買えない場合は買わない - 短期借入で購入は不可）
        if (company.cash >= totalCost) {
            company.cash -= totalCost;
            company.chips.computer = 1;
            company.chips.insurance = 1;
        } else if (company.cash >= computerCost) {
            company.cash -= computerCost;
            company.chips.computer = 1;
        } else if (company.cash >= insuranceCost) {
            company.cash -= insuranceCost;
            company.chips.insurance = 1;
        }
    });

    // Period 3-5: 借入なしの場合は2行目から開始
    gameState.currentRow = 2;  // Start from row 2 (period start processing uses 1 row)
    // Set maxRows based on period
    if (gameState.currentPeriod === 3) {
        gameState.maxRows = gameState.maxRowsByPeriod[3];
    } else if (gameState.currentPeriod === 4) {
        gameState.maxRows = gameState.maxRowsByPeriod[4];
    } else if (gameState.currentPeriod === 5) {
        gameState.maxRows = gameState.maxRowsByPeriod[5];
    }
    gameState.periodStarted = true;

    // プレイヤーの期首倉庫購入処理
    processPeriodStartWarehousePurchase();

    // 特別ルール: 期首処理後に現金がマイナスなら強制100円借入
    checkEmergencyLoan();

    // AI会社の長期借入処理
    processAILongTermBorrowing();

    // AI会社の期首計画を策定
    gameState.companies.forEach((company, index) => {
        if (company.type === 'ai') {
            AIBrain.createPeriodPlan(company, index);
        }
    });
    console.log('[AI] 全AI会社の期首計画策定完了');

    closeModal();
    updateDisplay();
    saveGame();  // 期首を自動セーブ
    showToast(`第${gameState.currentPeriod}期を開始します\n全社：コンピュータチップ(¥20)と保険チップ(¥5)を自動購入しました。\n期首処理完了で2行目からゲームスタートです。`, 'success', 5000);
    showTurnStartOptions();
}

// ============================================
// 借入モーダル表示
// ============================================
function showBorrowModal() {
    const company = gameState.companies[0];
    // 借入上限：3期は0.5倍、4期以降で自己資本300超なら1倍
    const loanMultiplier = (gameState.currentPeriod >= 4 && company.equity > 300) ? 1.0 : 0.5;
    const maxLoanTotal = Math.round(company.equity * loanMultiplier);
    const availableLoan = Math.max(0, maxLoanTotal - company.loans);
    const loanRuleText = (gameState.currentPeriod >= 4 && company.equity > 300)
        ? `自己資本の1倍まで`
        : `自己資本の0.5倍`;

    window.loanSelection = { amount: 0, max: availableLoan };

    // クイック選択オプション（よく使う金額）
    const quickOptions = [0, 50, 100, 150, 200].filter(v => v <= availableLoan);

    const quickCards = quickOptions.map((amount) => {
        const isSelected = amount === 0;
        const netAmount = Math.floor(amount * 0.9);
        return `
            <div onclick="selectLoanAmount(${amount})" id="loan-${amount}" style="background: ${isSelected ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151'}; color: white; padding: 8px 6px; border-radius: 8px; text-align: center; cursor: pointer; border: 2px solid ${isSelected ? '#60a5fa' : 'transparent'}; font-size: 12px;">
                <div style="font-weight: bold;">${amount === 0 ? '借りない' : '¥' + amount}</div>
                ${amount > 0 ? `<div style="font-size: 9px; opacity: 0.8;">→¥${netAmount}</div>` : ''}
            </div>
        `;
    }).join('');

    const content = `
        <div style="padding: 8px;">
            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                <span style="font-weight: bold; color: #92400e;">💰 ¥${company.cash}</span>
                <span style="font-size: 12px; color: #78350f; margin-left: 10px;">借入中 ¥${company.loans}</span>
            </div>

            <div style="font-size: 11px; color: #666; text-align: center; margin-bottom: 8px;">
                ${loanRuleText}（上限¥${maxLoanTotal}）・利息10%・<strong>1円単位</strong>
            </div>

            <!-- クイック選択 -->
            <div style="display: grid; grid-template-columns: repeat(${quickOptions.length}, 1fr); gap: 4px; margin-bottom: 8px;">
                ${quickCards}
            </div>

            <!-- 1円単位入力 -->
            <div style="background: #f1f5f9; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-size: 11px; color: #666; margin-bottom: 6px; text-align: center;">または金額を直接入力（1円単位）</div>
                <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
                    <span style="font-size: 14px;">¥</span>
                    <input type="number" id="loanAmountInput" value="0" min="0" max="${availableLoan}"
                           onchange="updateLoanAmount()" oninput="updateLoanAmount()"
                           style="width: 80px; padding: 8px; font-size: 16px; text-align: center; border: 2px solid #3b82f6; border-radius: 6px;">
                    <span style="font-size: 11px; color: #666;">/ 上限¥${availableLoan}</span>
                </div>
            </div>

            <div id="loanResultDisplay" style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center; display: none;">
                <span style="color: #1e40af;">借入額: <strong id="loanAmountText">¥0</strong> → 入金: <strong id="loanNetText">¥0</strong></span>
            </div>

            <button class="submit-btn" onclick="processBorrowing()" style="width: 100%; padding: 12px;">💳 借入実行</button>
        </div>
    `;

    showModal('長期借入', content);
}

// ============================================
// 借入額選択（クイックボタン）
// ============================================
function selectLoanAmount(amount) {
    window.loanSelection.amount = amount;
    document.getElementById('loanAmountInput').value = amount;
    updateLoanDisplay(amount);

    // ボタンのハイライト更新
    const quickOptions = [0, 50, 100, 150, 200].filter(v => v <= window.loanSelection.max);
    quickOptions.forEach(opt => {
        const el = document.getElementById(`loan-${opt}`);
        if (el) {
            el.style.background = opt === amount ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151';
            el.style.borderColor = opt === amount ? '#60a5fa' : 'transparent';
        }
    });
}

// ============================================
// 借入額入力更新（1円単位入力）
// ============================================
function updateLoanAmount() {
    const input = document.getElementById('loanAmountInput');
    let amount = parseInt(input.value) || 0;
    amount = Math.max(0, Math.min(amount, window.loanSelection.max));
    input.value = amount;
    window.loanSelection.amount = amount;
    updateLoanDisplay(amount);

    // クイックボタンのハイライトをリセット
    const quickOptions = [0, 50, 100, 150, 200].filter(v => v <= window.loanSelection.max);
    quickOptions.forEach(opt => {
        const el = document.getElementById(`loan-${opt}`);
        if (el) {
            el.style.background = opt === amount ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151';
            el.style.borderColor = opt === amount ? '#60a5fa' : 'transparent';
        }
    });
}

// ============================================
// 借入表示更新
// ============================================
function updateLoanDisplay(amount) {
    const resultDisplay = document.getElementById('loanResultDisplay');
    if (amount > 0) {
        resultDisplay.style.display = 'block';
        document.getElementById('loanAmountText').textContent = '¥' + amount;
        document.getElementById('loanNetText').textContent = '¥' + Math.floor(amount * 0.9);
    } else {
        resultDisplay.style.display = 'none';
    }
}

// ============================================
// 借入処理実行
// ============================================
function processBorrowing() {
    const company = gameState.companies[0];
    const loanAmount = window.loanSelection?.amount || 0;

    if (loanAmount > 0) {
        company.loans += loanAmount;
        const netAmount = Math.floor(loanAmount * 0.9);  // 長期借入: 借入時10%金利控除
        company.cash += netAmount;
        alert(`長期借入¥${loanAmount}（利息控除後¥${netAmount}入金）`);
    }

    closeModal();
    updateDisplay();
    saveGame();  // 借入後を自動セーブ
    showTurnStartOptions();
}

// ============================================
// AI会社の長期借入処理（3期以降の期首）
// ============================================
function processAILongTermBorrowing() {
    if (gameState.currentPeriod < 3) return;

    gameState.companies.forEach((company, index) => {
        if (company.type !== 'ai') return;

        // 借入上限計算（4期以降、自己資本300超なら1倍）
        const loanMultiplier = (gameState.currentPeriod >= 4 && company.equity > 300) ? 1.0 : 0.5;
        const maxLoanTotal = Math.round(company.equity * loanMultiplier);
        const availableLoan = Math.max(0, maxLoanTotal - company.loans);

        if (availableLoan <= 0) return;

        // 戦略別の借入判断
        let borrowRatio = 0;  // 借入可能額に対する借入割合
        const mfgCapacity = getManufacturingCapacity(company);
        const salesCapacity = getSalesCapacity(company);
        const periodsRemaining = 5 - gameState.currentPeriod;
        const needsInvestment = company.chips.research < 3 || mfgCapacity < 6 || salesCapacity < 6;

        switch (company.strategy) {
            case 'aggressive':
                // 積極的：投資余力が必要なら積極的に借入
                if (needsInvestment && company.cash < 150) {
                    borrowRatio = 0.8;  // 80%まで借入
                } else if (company.cash < 100) {
                    borrowRatio = 0.5;
                }
                break;

            case 'conservative':
                // 保守的：最低限の借入のみ
                if (company.cash < 50 && needsInvestment) {
                    borrowRatio = 0.3;  // 30%まで
                }
                break;

            case 'price_focused':
                // 価格競争：研究チップ投資のため借入
                if (company.chips.research < 4 && company.cash < 120) {
                    borrowRatio = 0.6;
                }
                break;

            case 'tech_focused':
                // 技術重視：チップ投資のため積極借入
                if ((company.chips.research < 4 || company.chips.education < 2) && company.cash < 150) {
                    borrowRatio = 0.7;
                }
                break;

            case 'balanced':
                // バランス：中程度の借入
                if (needsInvestment && company.cash < 120) {
                    borrowRatio = 0.5;
                }
                break;

            case 'unpredictable':
                // 予測不能：ランダム
                if (Math.random() > 0.5 && company.cash < 150) {
                    borrowRatio = Math.random() * 0.7;
                }
                break;
        }

        // 残り期数が少ない場合は借入を控える（返済リスク）
        if (periodsRemaining <= 1) {
            borrowRatio *= 0.3;
        }

        // 借入実行
        if (borrowRatio > 0) {
            const loanAmount = Math.floor(availableLoan * borrowRatio);  // 1円単位
            if (loanAmount >= 1) {
                company.loans += loanAmount;
                const netAmount = Math.floor(loanAmount * 0.9);  // 10%金利控除
                company.cash += netAmount;
                console.log(`${company.name}が長期借入¥${loanAmount}（入金¥${netAmount}）を実行`);
            }
        }
    });
}

// ============================================
// 期末返済処理
// ============================================
function processEndPeriodLoanRepayments(financialData) {
    // AI会社の自動返済処理
    gameState.companies.forEach(company => {
        if (company.type === 'ai') {
            processAutoLoanRepayment(company);
        }
    });

    // プレイヤー会社の返済UI表示
    const player = gameState.companies[0];
    if (player.shortLoans > 0 || player.loans > 0) {
        showLoanRepaymentModal(financialData);
    } else {
        // 借入がない場合は直接決算表示へ
        window.currentSettlementIndex = 0;
        showCompanySettlement(0, financialData);
    }
}

// ============================================
// AI会社の自動返済処理
// ============================================
function processAutoLoanRepayment(company) {
    // 短期借入: 最低20%返済
    if (company.shortLoans > 0) {
        const minShortPayment = Math.ceil(company.shortLoans * 0.2);
        const actualPayment = Math.min(minShortPayment, company.cash);

        if (actualPayment > 0) {
            company.cash -= actualPayment;
            company.shortLoans -= actualPayment;
        }

        // 資金不足で最低返済できない場合は短期借入で補填
        if (actualPayment < minShortPayment) {
            const shortfall = minShortPayment - actualPayment;
            const needed = Math.ceil(shortfall / 0.8 / 50) * 50;
            company.shortLoans += needed;
            company.cash += needed * 0.8;
            company.cash -= (minShortPayment - actualPayment);
            company.shortLoans -= (minShortPayment - actualPayment);
        }
    }

    // 長期借入: 最低10%返済
    if (company.loans > 0) {
        const minLongPayment = Math.ceil(company.loans * 0.1);
        const actualPayment = Math.min(minLongPayment, company.cash);

        if (actualPayment > 0) {
            company.cash -= actualPayment;
            company.loans -= actualPayment;
        }

        // 資金不足で最低返済できない場合は短期借入で補填
        if (actualPayment < minLongPayment) {
            const shortfall = minLongPayment - actualPayment;
            const needed = Math.ceil(shortfall / 0.8 / 50) * 50;
            company.shortLoans += needed;
            company.cash += needed * 0.8;
            company.cash -= (minLongPayment - actualPayment);
            company.loans -= (minLongPayment - actualPayment);
        }
    }
}

// ============================================
// プレイヤー返済UIモーダル
// ============================================
function showLoanRepaymentModal(financialData) {
    const player = gameState.companies[0];
    const minShortPayment = player.shortLoans > 0 ? Math.ceil(player.shortLoans * 0.2) : 0;
    const minLongPayment = player.loans > 0 ? Math.ceil(player.loans * 0.1) : 0;

    window.repaymentSelection = {
        short: minShortPayment,
        long: minLongPayment,
        shortMin: minShortPayment,
        shortMax: player.shortLoans,
        longMin: minLongPayment,
        longMax: player.loans
    };

    let shortSection = '';
    if (player.shortLoans > 0) {
        shortSection = `
            <div style="background: linear-gradient(135deg, #fecaca 0%, #fca5a5 100%); border-radius: 10px; padding: 10px; margin-bottom: 8px;">
                <div style="font-size: 12px; color: #991b1b; margin-bottom: 6px;">
                    📛 短期借入（残高¥${player.shortLoans}・最低20%）
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div onclick="selectRepayment('short', 'min')" id="short-min" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 10px; border-radius: 8px; text-align: center; cursor: pointer; border: 2px solid #f87171;">
                        <div style="font-size: 11px;">最低返済</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${minShortPayment}</div>
                    </div>
                    ${player.shortLoans <= player.cash ? `
                    <div onclick="selectRepayment('short', 'full')" id="short-full" style="background: #374151; color: white; padding: 10px; border-radius: 8px; text-align: center; cursor: pointer; border: 2px solid transparent;">
                        <div style="font-size: 11px;">全額返済</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${player.shortLoans}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    let longSection = '';
    if (player.loans > 0) {
        longSection = `
            <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-radius: 10px; padding: 10px; margin-bottom: 10px;">
                <div style="font-size: 12px; color: #1e40af; margin-bottom: 6px;">
                    💳 長期借入（残高¥${player.loans}・最低10%）
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div onclick="selectRepayment('long', 'min')" id="long-min" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 10px; border-radius: 8px; text-align: center; cursor: pointer; border: 2px solid #60a5fa;">
                        <div style="font-size: 11px;">最低返済</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${minLongPayment}</div>
                    </div>
                    ${player.loans <= player.cash ? `
                    <div onclick="selectRepayment('long', 'full')" id="long-full" style="background: #374151; color: white; padding: 10px; border-radius: 8px; text-align: center; cursor: pointer; border: 2px solid transparent;">
                        <div style="font-size: 11px;">全額返済</div>
                        <div style="font-size: 16px; font-weight: bold;">¥${player.loans}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    const totalMin = minShortPayment + minLongPayment;

    const content = `
        <div style="padding: 8px;">
            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                <span style="font-weight: bold; color: #92400e;">💰 現金 ¥${player.cash}</span>
            </div>
            ${shortSection}
            ${longSection}
            <div id="repaymentTotal" style="background: #f1f5f9; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                <span style="color: #374151;">合計返済: <strong id="repaymentTotalAmount">¥${totalMin}</strong></span>
            </div>
            <button class="submit-btn" onclick="processPlayerLoanRepayment()" style="width: 100%; padding: 12px;">💳 返済実行</button>
        </div>
    `;

    showModal('期末返済処理', content);
}

// ============================================
// 返済額選択
// ============================================
function selectRepayment(type, mode) {
    const data = window.repaymentSelection;
    if (type === 'short') {
        data.short = mode === 'full' ? data.shortMax : data.shortMin;
        const minEl = document.getElementById('short-min');
        const fullEl = document.getElementById('short-full');
        if (minEl) {
            minEl.style.background = mode === 'min' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : '#374151';
            minEl.style.borderColor = mode === 'min' ? '#f87171' : 'transparent';
        }
        if (fullEl) {
            fullEl.style.background = mode === 'full' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : '#374151';
            fullEl.style.borderColor = mode === 'full' ? '#f87171' : 'transparent';
        }
    } else {
        data.long = mode === 'full' ? data.longMax : data.longMin;
        const minEl = document.getElementById('long-min');
        const fullEl = document.getElementById('long-full');
        if (minEl) {
            minEl.style.background = mode === 'min' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151';
            minEl.style.borderColor = mode === 'min' ? '#60a5fa' : 'transparent';
        }
        if (fullEl) {
            fullEl.style.background = mode === 'full' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151';
            fullEl.style.borderColor = mode === 'full' ? '#60a5fa' : 'transparent';
        }
    }
    document.getElementById('repaymentTotalAmount').textContent = '¥' + (data.short + data.long);
}

// ============================================
// プレイヤー返済処理実行
// ============================================
function processPlayerLoanRepayment() {
    const player = gameState.companies[0];
    const data = window.repaymentSelection || { short: 0, long: 0 };

    const shortRepayment = data.short || 0;
    const longRepayment = data.long || 0;
    const totalRepayment = shortRepayment + longRepayment;

    // 資金不足の場合は短期借入
    if (player.cash < totalRepayment) {
        const needed = Math.ceil((totalRepayment - player.cash) / 0.8 / 50) * 50;
        player.shortLoans += needed;
        player.cash += needed * 0.8;
        alert(`資金不足のため¥${needed}を短期借入しました`);
    }

    // 返済処理
    player.cash -= totalRepayment;
    player.shortLoans -= shortRepayment;
    player.loans -= longRepayment;

    closeModal();

    // 決算表示へ
    window.currentSettlementIndex = 0;
    showCompanySettlement(0, window.lastFinancialData);
}
