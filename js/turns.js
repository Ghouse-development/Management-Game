// ==============================================
// turns.js - ターン・期間管理モジュール
// ==============================================

// Start period
function startPeriod() {
    if (gameState.periodStarted) return;

    // 3期以降はまずサイコロを振る
    if (gameState.currentPeriod >= 3 && !gameState.diceRolled) {
        showDiceRollModal();
        return;
    }

    showPeriodStartOptions();
}

// 3期以降のサイコロモーダル
function showDiceRollModal() {
    const diceRollerName = gameState.previousPQTopName || 'システム';
    const diceRollerPQ = gameState.previousPQTopAmount || 0;
    const isPlayerRoller = (gameState.previousPQTopIndex === 0);

    const content = `
        <div style="text-align: center; padding: 20px;">
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border-radius: 16px; padding: 25px; color: white; margin-bottom: 20px;">
                <div style="font-size: 14px; opacity: 0.9; margin-bottom: 10px;">
                    前期PQトップ: <strong>${diceRollerName}</strong>（¥${diceRollerPQ}）
                </div>
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 15px;">
                    ${isPlayerRoller ? 'あなたがサイコロを振ります！' : `${diceRollerName}がサイコロを振ります`}
                </div>
                <div id="dice-display" style="font-size: 72px; margin: 20px 0;">🎲</div>
                <div id="dice-result" style="display: none; margin-top: 15px;">
                    <div style="font-size: 48px; font-weight: bold;" id="dice-number"></div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 15px; font-size: 12px;">
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px;">
                            <div style="opacity: 0.8;">市場閉鎖</div>
                            <div style="font-weight: bold;" id="closed-markets"></div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px;">
                            <div style="opacity: 0.8;">人件費倍率</div>
                            <div style="font-weight: bold;" id="wage-multiplier"></div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px;">
                            <div style="opacity: 0.8;">大阪上限</div>
                            <div style="font-weight: bold;" id="osaka-max"></div>
                        </div>
                    </div>
                </div>
            </div>
            <button id="roll-dice-btn" class="submit-btn" onclick="rollPeriodDice()" style="width: 100%; padding: 15px; font-size: 18px;">
                🎲 サイコロを振る
            </button>
            <button id="proceed-btn" class="submit-btn" onclick="proceedAfterDice()" style="width: 100%; padding: 15px; font-size: 16px; display: none; margin-top: 10px;">
                期首処理へ進む →
            </button>
        </div>
    `;

    showModal(`第${gameState.currentPeriod}期 サイコロ`, content);
}

// サイコロを振る
function rollPeriodDice() {
    const rollBtn = document.getElementById('roll-dice-btn');
    const diceDisplay = document.getElementById('dice-display');
    const diceResult = document.getElementById('dice-result');
    const proceedBtn = document.getElementById('proceed-btn');

    rollBtn.disabled = true;
    rollBtn.textContent = '振っています...';

    let rollCount = 0;
    const rollInterval = setInterval(() => {
        const tempDice = Math.floor(Math.random() * 6) + 1;
        diceDisplay.textContent = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][tempDice - 1];
        rollCount++;
        if (rollCount > 10) {
            clearInterval(rollInterval);

            gameState.diceRoll = Math.floor(Math.random() * 6) + 1;
            diceDisplay.textContent = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][gameState.diceRoll - 1];

            if (gameState.diceRoll <= 3) {
                gameState.wageMultiplier = 1.1;
                gameState.markets[0].closed = true;
                gameState.markets[1].closed = false;
            } else {
                gameState.wageMultiplier = 1.2;
                gameState.markets[0].closed = true;
                gameState.markets[1].closed = true;
            }

            gameState.osakaMaxPrice = 20 + gameState.diceRoll;
            gameState.markets[4].sellPrice = gameState.osakaMaxPrice;

            document.getElementById('dice-number').textContent = gameState.diceRoll;
            document.getElementById('closed-markets').textContent = gameState.diceRoll <= 3 ? '仙台のみ' : '仙台・札幌';
            document.getElementById('wage-multiplier').textContent = `×${gameState.wageMultiplier}`;
            document.getElementById('osaka-max').textContent = `¥${gameState.osakaMaxPrice}`;

            diceResult.style.display = 'block';
            rollBtn.style.display = 'none';
            proceedBtn.style.display = 'block';

            gameState.diceRolled = true;
        }
    }, 100);
}

// サイコロ後に期首処理へ
function proceedAfterDice() {
    closeModal();
    showPeriodStartOptions();
}

// 借入金額入力の更新
function updateLoanSelection() {
    const input = document.getElementById('loanAmountInput');
    const interestDisplay = document.getElementById('loanInterestDisplay');
    const amount = parseInt(input.value) || 0;
    const interest = Math.floor(amount * 0.1);
    interestDisplay.textContent = `¥${interest}`;
    window.periodStartSelections.loan = amount;
}

// 期首処理のカード選択
function selectPeriodStart(type, value) {
    window.periodStartSelections[type] = value;

    document.querySelectorAll(`[id^="${type}-"]`).forEach(card => {
        card.style.background = '#374151';
        card.style.borderColor = '#6b7280';
    });

    const selected = document.getElementById(`${type}-${value}`);
    if (selected) {
        selected.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        selected.style.borderColor = '#34d399';
    }
}

// Draw card from deck
function drawCard() {
    closeModal();

    if (!gameState.deckInitialized || gameState.cardDeck.length === 0) {
        initializeCardDeck();
    }

    const cardType = gameState.cardDeck.pop();
    console.log(`カードを引きました: ${cardType}（残り${gameState.cardDeck.length}枚）`);

    showCardDrawAnimation(cardType);
}

// Select decision card
function selectDecisionCard(cardId) {
    const card = gameState.decisionCards.find(c => c.id === cardId);
    gameState.companies[0].decisionCard = card;

    closeModal();

    switch(cardId) {
        case 1: showSalesModal(); break;
        case 2: showBuyMaterialsModal(); break;
        case 3: showProductionModal(); break;
        case 4: showHireModal(); break;
        case 5: showMachineModal(); break;
        case 6: showChipPurchaseModal(); break;
        case 7: doNothing(); break;
    }
}

// Increment row and check for period end
function incrementRow(companyIndex) {
    const company = gameState.companies[companyIndex];
    company.currentRow = (company.currentRow || 1) + 1;

    if (!company.last5RowWarningShown && company.currentRow >= gameState.maxRows - 5 && company.type === 'player') {
        company.last5RowWarningShown = true;
        showLast5RowWarning(company);
    }

    if (company.currentRow >= gameState.maxRows) {
        console.log(`${company.name}が行数上限（${gameState.maxRows}行）に達しました！期末処理を開始します。`);
        gameState.periodEnding = true; // 期末処理フラグを立てる
        showPeriodEndAnnouncement(company);
        return true;
    }
    return false;
}

function closePeriodEndAnnouncementAndStartSettlement() {
    if (window.currentAITurnTimeout) {
        clearTimeout(window.currentAITurnTimeout);
        window.currentAITurnTimeout = null;
    }
    closeModal();
    endPeriod();
}

// End turn
function endTurn() {
    const company = gameState.companies[gameState.currentPlayerIndex];

    company.cannotProduce = false;

    if (incrementRow(gameState.currentPlayerIndex)) {
        return;
    }

    gameState.doNothingCount[gameState.currentPlayerIndex] = 0;

    saveGame();

    nextTurn();
}

// Next turn
function nextTurn() {
    if (window.currentAITurnTimeout) {
        clearTimeout(window.currentAITurnTimeout);
        window.currentAITurnTimeout = null;
    }

    if (gameState.turnReversed) {
        gameState.currentPlayerIndex--;
        if (gameState.currentPlayerIndex < 0) {
            gameState.currentPlayerIndex = gameState.companies.length - 1;
            gameState.currentRow++;

            if (gameState.currentRow > gameState.maxRows) {
                endPeriod();
                return;
            }
        }
    } else {
        gameState.currentPlayerIndex++;
        if (gameState.currentPlayerIndex >= gameState.companies.length) {
            gameState.currentPlayerIndex = 0;
            gameState.currentRow++;

            if (gameState.currentRow > gameState.maxRows) {
                endPeriod();
                return;
            }
        }
    }

    updateDisplay();

    if (gameState.currentPlayerIndex !== 0) {
        setTimeout(executeAITurn, 1000);
    } else {
        if (gameState.companies[0].skipTurns > 0) {
            gameState.companies[0].skipTurns--;
            alert(`休み中（残り${gameState.companies[0].skipTurns}回）`);
            nextTurn();
        } else {
            showTurnStartOptions();
        }
    }
}

// Resume game
function resumeGame() {
    const saveData = loadGame();
    if (saveData) {
        restoreGame(saveData);
        document.getElementById('modalContainer').innerHTML = '';
        updateDisplay();
        showToast('ゲームを再開しました（' + gameState.currentPeriod + '期）', 'success', 3000);
    }
}

// Start new game
function startNewGame() {
    deleteSavedGame();
    initializeCompanies();
    initializeCardDeck();
    const randomStartIndex = Math.floor(Math.random() * gameState.companies.length);
    gameState.currentPlayerIndex = randomStartIndex;
    gameState.periodStartPlayerIndex = randomStartIndex;
    document.getElementById('modalContainer').innerHTML = '';
    updateDisplay();
    saveGame();
    const startPlayer = gameState.companies[randomStartIndex];
    showToast(`🎲 ${startPlayer.name}からスタート！`, 'info', 3000);

    if (randomStartIndex !== 0) {
        setTimeout(executeAITurn, 1500);
    } else {
        showTurnStartOptions();
    }
}

// Confirm delete save
function confirmDeleteSave() {
    if (confirm('セーブデータを削除しますか？この操作は取り消せません。')) {
        deleteSavedGame();
        showStartMenu();
    }
}

// Initialize game
function initGame() {
    console.log("initGame started");
    try {
        initializeCompanies();
        console.log("Companies initialized");
        initializeCardDeck();
        console.log("Card deck initialized (75 cards)");

        if (hasSavedGame()) {
            showStartMenu();
        } else {
            updateDisplay();
            saveGame();
        }
        console.log("Display updated");
    } catch(e) {
        console.error("Error in initGame:", e);
        alert("エラーが発生しました: " + e.message);
    }
}

// グローバル公開
if (typeof window !== 'undefined') {
    window.startPeriod = startPeriod;
    window.showDiceRollModal = showDiceRollModal;
    window.rollPeriodDice = rollPeriodDice;
    window.proceedAfterDice = proceedAfterDice;
    window.updateLoanSelection = updateLoanSelection;
    window.selectPeriodStart = selectPeriodStart;
    window.drawCard = drawCard;
    window.selectDecisionCard = selectDecisionCard;
    window.incrementRow = incrementRow;
    window.closePeriodEndAnnouncementAndStartSettlement = closePeriodEndAnnouncementAndStartSettlement;
    window.endTurn = endTurn;
    window.nextTurn = nextTurn;
    window.resumeGame = resumeGame;
    window.startNewGame = startNewGame;
    window.confirmDeleteSave = confirmDeleteSave;
    window.initGame = initGame;
}
