/**
 * MG (Management Game) - カスタムモード
 *
 * 1. カスタム条件でゲーム開始
 * 2. AI行動提案モード（5期で自己資本450達成に向けた提案）
 */

// ============================================
// カスタム条件入力モーダル
// ============================================

function showCustomGameSetupModal() {
    const content = `
        <div style="max-height: 70vh; overflow-y: auto; padding: 10px;">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 12px; border-radius: 10px; margin-bottom: 15px; text-align: center;">
                <div style="font-size: 16px; font-weight: bold;">カスタム条件でゲーム開始</div>
                <div style="font-size: 11px; opacity: 0.9; margin-top: 4px;">任意の状態からゲームを開始できます</div>
            </div>

            <!-- 基本設定 -->
            <div style="background: #f3f4f6; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="font-weight: bold; margin-bottom: 8px; font-size: 13px;">基本設定</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label style="font-size: 11px; color: #666;">開始期</label>
                        <select id="custom-period" style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
                            <option value="2">2期</option>
                            <option value="3">3期</option>
                            <option value="4">4期</option>
                            <option value="5">5期</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #666;">開始行</label>
                        <input type="number" id="custom-row" value="2" min="1" max="30" style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                </div>
            </div>

            <!-- 財務状態 -->
            <div style="background: #dbeafe; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="font-weight: bold; margin-bottom: 8px; font-size: 13px; color: #1e40af;">財務状態</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
                    <div>
                        <label style="color: #666;">現金</label>
                        <input type="number" id="custom-cash" value="300" step="10" style="width: 100%; padding: 5px; border: 1px solid #93c5fd; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">自己資本</label>
                        <input type="number" id="custom-equity" value="300" step="10" style="width: 100%; padding: 5px; border: 1px solid #93c5fd; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">長期借入</label>
                        <input type="number" id="custom-long-loan" value="0" step="50" style="width: 100%; padding: 5px; border: 1px solid #93c5fd; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">短期借入</label>
                        <input type="number" id="custom-short-loan" value="0" step="50" style="width: 100%; padding: 5px; border: 1px solid #93c5fd; border-radius: 4px;">
                    </div>
                </div>
            </div>

            <!-- 会社盤状態 -->
            <div style="background: #fef3c7; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="font-weight: bold; margin-bottom: 8px; font-size: 13px; color: #92400e;">会社盤（人・機械）</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px;">
                    <div>
                        <label style="color: #666;">ワーカー</label>
                        <input type="number" id="custom-workers" value="4" min="0" max="10" style="width: 100%; padding: 5px; border: 1px solid #fcd34d; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">セールス</label>
                        <input type="number" id="custom-salesmen" value="4" min="0" max="10" style="width: 100%; padding: 5px; border: 1px solid #fcd34d; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">機械</label>
                        <input type="number" id="custom-machines" value="4" min="0" max="10" style="width: 100%; padding: 5px; border: 1px solid #fcd34d; border-radius: 4px;">
                    </div>
                </div>
            </div>

            <!-- 在庫 -->
            <div style="background: #e0e7ff; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="font-weight: bold; margin-bottom: 8px; font-size: 13px; color: #4338ca;">在庫</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px;">
                    <div>
                        <label style="color: #666;">材料</label>
                        <input type="number" id="custom-materials" value="0" min="0" style="width: 100%; padding: 5px; border: 1px solid #a5b4fc; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">仕掛品</label>
                        <input type="number" id="custom-wip" value="0" min="0" style="width: 100%; padding: 5px; border: 1px solid #a5b4fc; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">製品</label>
                        <input type="number" id="custom-products" value="0" min="0" style="width: 100%; padding: 5px; border: 1px solid #a5b4fc; border-radius: 4px;">
                    </div>
                </div>
            </div>

            <!-- チップ -->
            <div style="background: #fae8ff; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="font-weight: bold; margin-bottom: 8px; font-size: 13px; color: #a21caf;">戦略チップ</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px;">
                    <div>
                        <label style="color: #666;">研究（青）</label>
                        <input type="number" id="custom-research" value="0" min="0" max="6" style="width: 100%; padding: 5px; border: 1px solid #e879f9; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">教育（緑）</label>
                        <input type="number" id="custom-education" value="0" min="0" max="6" style="width: 100%; padding: 5px; border: 1px solid #e879f9; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">広告（赤）</label>
                        <input type="number" id="custom-advertising" value="0" min="0" max="6" style="width: 100%; padding: 5px; border: 1px solid #e879f9; border-radius: 4px;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 12px; margin-top: 8px;">
                    <div>
                        <label style="color: #666;">PC</label>
                        <input type="number" id="custom-computer" value="1" min="0" max="3" style="width: 100%; padding: 5px; border: 1px solid #e879f9; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">保険</label>
                        <input type="number" id="custom-insurance" value="1" min="0" max="3" style="width: 100%; padding: 5px; border: 1px solid #e879f9; border-radius: 4px;">
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 10px;">
                <button class="submit-btn" onclick="startCustomGame()" style="flex: 2; padding: 12px;">ゲーム開始</button>
                <button class="cancel-btn" onclick="showStartMenu()" style="flex: 1; padding: 12px;">戻る</button>
            </div>
        </div>
    `;

    showModal('カスタム設定', content);
}

// カスタム条件でゲーム開始
function startCustomGame() {
    // 入力値取得
    const period = parseInt(document.getElementById('custom-period').value);
    const row = parseInt(document.getElementById('custom-row').value);
    const cash = parseInt(document.getElementById('custom-cash').value);
    const equity = parseInt(document.getElementById('custom-equity').value);
    const longLoan = parseInt(document.getElementById('custom-long-loan').value);
    const shortLoan = parseInt(document.getElementById('custom-short-loan').value);
    const workers = parseInt(document.getElementById('custom-workers').value);
    const salesmen = parseInt(document.getElementById('custom-salesmen').value);
    const machines = parseInt(document.getElementById('custom-machines').value);
    const materials = parseInt(document.getElementById('custom-materials').value);
    const wip = parseInt(document.getElementById('custom-wip').value);
    const products = parseInt(document.getElementById('custom-products').value);
    const research = parseInt(document.getElementById('custom-research').value);
    const education = parseInt(document.getElementById('custom-education').value);
    const advertising = parseInt(document.getElementById('custom-advertising').value);
    const computer = parseInt(document.getElementById('custom-computer').value);
    const insurance = parseInt(document.getElementById('custom-insurance').value);

    // セーブデータ削除して新規開始
    deleteSavedGame();
    initializeCompanies();
    initializeCardDeck();

    // プレイヤー会社の状態を設定
    const player = gameState.companies[0];
    player.cash = cash;
    player.equity = equity;
    player.loans = longLoan;
    player.shortLoans = shortLoan;
    player.workers = workers;
    player.salesmen = salesmen;
    player.machines = machines;
    player.materials = materials;
    player.wip = wip;
    player.products = products;
    player.chips = {
        research: research,
        education: education,
        advertising: advertising,
        computer: computer,
        insurance: insurance
    };
    player.currentRow = row;
    player.rowsUsed = row - 1;

    // ゲーム状態を設定
    gameState.currentPeriod = period;
    gameState.currentRow = row;
    gameState.maxRows = MAX_ROWS_BY_PERIOD[period];
    gameState.periodStarted = false;
    gameState.diceRolled = false;

    // ランダムなスタートプレイヤー
    const randomStartIndex = Math.floor(Math.random() * gameState.companies.length);
    gameState.currentPlayerIndex = randomStartIndex;
    gameState.periodStartPlayerIndex = randomStartIndex;

    closeModal();
    updateDisplay();
    saveGame();

    showToast(`カスタム条件で${period}期${row}行目からスタート！`, 'success', 3000);

    if (randomStartIndex !== 0) {
        setTimeout(() => startPeriod(), 500);
    } else {
        startPeriod();
    }
}

// ============================================
// AI行動提案モーダル
// ============================================

function showAIActionPlanModal() {
    const content = `
        <div style="max-height: 70vh; overflow-y: auto; padding: 10px;">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 15px; border-radius: 12px; margin-bottom: 15px; text-align: center;">
                <div style="font-size: 18px; font-weight: bold;">AI行動提案モード</div>
                <div style="font-size: 12px; opacity: 0.9; margin-top: 6px;">5期終了時に自己資本450達成を目指す行動計画</div>
            </div>

            <!-- 初期条件入力 -->
            <div style="background: #f3f4f6; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="font-weight: bold; margin-bottom: 8px; font-size: 13px;">現在の状態を入力</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
                    <div>
                        <label style="color: #666;">現在期</label>
                        <select id="plan-period" style="width: 100%; padding: 5px; border: 1px solid #d1d5db; border-radius: 4px;" onchange="updatePlanInputs()">
                            <option value="2" selected>2期開始時</option>
                            <option value="3">3期開始時</option>
                            <option value="4">4期開始時</option>
                            <option value="5">5期開始時</option>
                        </select>
                    </div>
                    <div>
                        <label style="color: #666;">現在自己資本</label>
                        <input type="number" id="plan-equity" value="300" step="10" style="width: 100%; padding: 5px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">現金</label>
                        <input type="number" id="plan-cash" value="300" step="10" style="width: 100%; padding: 5px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">借入合計</label>
                        <input type="number" id="plan-loans" value="0" step="50" style="width: 100%; padding: 5px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px; margin-top: 8px;">
                    <div>
                        <label style="color: #666;">W</label>
                        <input type="number" id="plan-workers" value="4" min="0" max="10" style="width: 100%; padding: 5px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">S</label>
                        <input type="number" id="plan-salesmen" value="4" min="0" max="10" style="width: 100%; padding: 5px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                    <div>
                        <label style="color: #666;">機械</label>
                        <input type="number" id="plan-machines" value="4" min="0" max="10" style="width: 100%; padding: 5px; border: 1px solid #d1d5db; border-radius: 4px;">
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button class="submit-btn" onclick="generateAIActionPlan()" style="flex: 1; padding: 12px;">
                    行動計画を生成
                </button>
                <button class="cancel-btn" onclick="showStartMenu()" style="flex: 1; padding: 12px;">戻る</button>
            </div>

            <!-- 計画表示エリア -->
            <div id="ai-plan-output" style="display: none;">
            </div>
        </div>
    `;

    showModal('AI行動提案', content);
}

// AI行動計画を生成
function generateAIActionPlan() {
    const startPeriod = parseInt(document.getElementById('plan-period').value);
    const currentEquity = parseInt(document.getElementById('plan-equity').value);
    const cash = parseInt(document.getElementById('plan-cash').value);
    const loans = parseInt(document.getElementById('plan-loans').value);
    const workers = parseInt(document.getElementById('plan-workers').value);
    const salesmen = parseInt(document.getElementById('plan-salesmen').value);
    const machines = parseInt(document.getElementById('plan-machines').value);

    const targetEquity = 450;
    const neededGrowth = targetEquity - currentEquity;
    const remainingPeriods = 5 - startPeriod + 1;

    // リスクカード想定（1/5の確率で引く、1期あたり平均5回引くとして1枚程度のリスク）
    const estimatedRiskLoss = remainingPeriods * 15; // 期あたり約15円のリスク損失想定

    // 必要なG（粗利）計算
    // G - F - 金利 - 税金配当 - リスク = 自己資本増加
    // Fは期ごとに異なるが、平均して約100-150円/期
    const estimatedFPerPeriod = 120;
    const estimatedInterest = loans * 0.1;
    const estimatedTaxDiv = 0.5; // Gの50%が税金・配当に

    // 目標G計算
    const neededGTotal = (neededGrowth + estimatedRiskLoss + estimatedFPerPeriod * remainingPeriods + estimatedInterest * remainingPeriods) / (1 - estimatedTaxDiv);
    const neededGPerPeriod = neededGTotal / remainingPeriods;

    // 製造能力と販売能力から推奨アクション決定
    const mfgCapacity = Math.min(workers, machines);
    const salesCapacity = Math.floor(salesmen * 1.5);
    const currentCapacity = Math.min(mfgCapacity, salesCapacity);

    let planHtml = `
        <div style="background: #eff6ff; border-radius: 10px; padding: 15px; margin-bottom: 15px;">
            <div style="font-size: 14px; font-weight: bold; color: #1e40af; margin-bottom: 10px;">目標達成への道筋</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px;">
                <div style="background: white; padding: 8px; border-radius: 6px;">
                    <div style="color: #666;">現在自己資本</div>
                    <div style="font-size: 16px; font-weight: bold; color: #dc2626;">¥${currentEquity}</div>
                </div>
                <div style="background: white; padding: 8px; border-radius: 6px;">
                    <div style="color: #666;">目標自己資本</div>
                    <div style="font-size: 16px; font-weight: bold; color: #16a34a;">¥${targetEquity}</div>
                </div>
                <div style="background: white; padding: 8px; border-radius: 6px;">
                    <div style="color: #666;">必要増加額</div>
                    <div style="font-size: 16px; font-weight: bold; color: #8b5cf6;">¥${neededGrowth}</div>
                </div>
                <div style="background: white; padding: 8px; border-radius: 6px;">
                    <div style="color: #666;">残り期数</div>
                    <div style="font-size: 16px; font-weight: bold;">${remainingPeriods}期</div>
                </div>
            </div>
            <div style="margin-top: 10px; padding: 8px; background: #fef3c7; border-radius: 6px; font-size: 11px; color: #92400e;">
                想定リスク損失: ¥${estimatedRiskLoss}（期あたり約15円）<br>
                必要粗利(G)目安: 期あたり約¥${Math.round(neededGPerPeriod)}
            </div>
        </div>
    `;

    // 各期の推奨会社盤状態と行動
    const periodPlans = generatePeriodPlans(startPeriod, currentEquity, cash, workers, salesmen, machines);

    planHtml += `<div style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #374151;">各期の推奨状態と行動</div>`;

    for (const plan of periodPlans) {
        const bgColor = plan.period === startPeriod ? '#dcfce7' : '#f9fafb';
        const borderColor = plan.period === startPeriod ? '#22c55e' : '#e5e7eb';
        const sim = plan.simulation;

        planHtml += `
            <div style="background: ${bgColor}; border: 2px solid ${borderColor}; border-radius: 10px; padding: 12px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-weight: bold; font-size: 14px; color: #1f2937;">
                        ${plan.period}期 ${plan.period === startPeriod ? '（現在）' : ''}
                    </div>
                    <div style="font-size: 12px; color: ${plan.endEquity >= 450 ? '#16a34a' : '#dc2626'}; font-weight: bold;">
                        期末予想: ¥${plan.endEquity}
                    </div>
                </div>

                <!-- 推奨会社盤状態 -->
                <div style="background: white; border-radius: 6px; padding: 8px; margin-bottom: 8px;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 4px;">推奨会社盤状態（期首時点）</div>
                    <div style="display: flex; gap: 8px; font-size: 11px; flex-wrap: wrap;">
                        <span style="background: #fef3c7; padding: 2px 6px; border-radius: 4px;">W: ${plan.targetWorkers}</span>
                        <span style="background: #fce7f3; padding: 2px 6px; border-radius: 4px;">S: ${plan.targetSalesmen}</span>
                        <span style="background: #e0e7ff; padding: 2px 6px; border-radius: 4px;">機: ${plan.targetMachines}</span>
                        <span style="background: #d1fae5; padding: 2px 6px; border-radius: 4px;">製造: ${plan.mfgCapacity}</span>
                        <span style="background: #fee2e2; padding: 2px 6px; border-radius: 4px;">販売: ${plan.salesCapacity}</span>
                    </div>
                </div>

                <!-- シミュレーションPL -->
                <div style="background: #f0fdf4; border-radius: 6px; padding: 8px; margin-bottom: 8px;">
                    <div style="font-size: 11px; color: #166534; margin-bottom: 4px; font-weight: bold;">予想損益（シミュレーション）</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>売上(PQ)</span><span style="font-weight: bold;">¥${sim.totalPQ}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>粗利(G)</span><span style="font-weight: bold; color: #16a34a;">¥${sim.totalG}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>給料</span><span>-¥${sim.salaryCost}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>固定費(F)</span><span>-¥${sim.fixedCost}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>経常利益</span><span style="font-weight: bold;">¥${sim.operatingProfit}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>リスク想定</span><span style="color: #dc2626;">-¥${sim.estimatedRiskLoss}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>税・配当</span><span>-¥${sim.taxAndDividend}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; background: #dcfce7; padding: 2px 4px; border-radius: 2px;">
                            <span style="font-weight: bold;">純利益</span><span style="font-weight: bold; color: ${sim.netProfit >= 0 ? '#16a34a' : '#dc2626'};">¥${sim.netProfit}</span>
                        </div>
                    </div>
                </div>

                <!-- 行動計画（折りたたみ可能） -->
                <details style="background: #fefce8; border-radius: 6px; padding: 8px;">
                    <summary style="font-size: 11px; color: #854d0e; cursor: pointer; font-weight: bold;">推奨アクション（${plan.actions.length}行）をクリックで展開</summary>
                    <div style="font-size: 10px; line-height: 1.5; margin-top: 6px; max-height: 200px; overflow-y: auto;">
                        ${plan.actions.map((a, i) => {
                            const categoryColor = {
                                'setup': '#8b5cf6',
                                'buy': '#0891b2',
                                'production': '#2563eb',
                                'sell': '#16a34a',
                                'buffer': '#9ca3af',
                                'end': '#dc2626'
                            }[a.category] || '#374151';
                            return `<div style="padding: 3px 0; ${i < plan.actions.length - 1 ? 'border-bottom: 1px dashed #fde68a;' : ''}">
                                <span style="color: #999; width: 35px; display: inline-block; font-size: 9px;">${a.row}行</span>
                                <span style="font-weight: 500; color: ${categoryColor};">${a.action}</span>
                                ${a.note ? `<span style="color: #78350f; margin-left: 4px; font-size: 9px;">${a.note}</span>` : ''}
                                ${a.cost ? `<span style="color: #dc2626; margin-left: 4px; font-size: 9px;">-¥${a.cost}</span>` : ''}
                                ${a.revenue ? `<span style="color: #16a34a; margin-left: 4px; font-size: 9px;">+¥${a.revenue}</span>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                </details>

                ${plan.warnings ? `
                <div style="background: #fee2e2; border-radius: 6px; padding: 6px; margin-top: 8px; font-size: 10px; color: #991b1b;">
                    ⚠️ ${plan.warnings}
                </div>
                ` : ''}
            </div>
        `;
    }

    // 達成可能性サマリー
    const finalEquity = periodPlans[periodPlans.length - 1].endEquity;
    const achievable = finalEquity >= 450;
    const progressPercent = Math.min(100, Math.round((finalEquity / 450) * 100));

    planHtml += `
        <div style="background: ${achievable ? '#dcfce7' : '#fef2f2'}; border: 2px solid ${achievable ? '#22c55e' : '#dc2626'}; border-radius: 12px; padding: 15px; margin-bottom: 15px;">
            <div style="text-align: center; margin-bottom: 10px;">
                <div style="font-size: 32px;">${achievable ? '🎉' : '⚠️'}</div>
                <div style="font-size: 16px; font-weight: bold; color: ${achievable ? '#166534' : '#991b1b'};">
                    ${achievable ? '目標達成可能！' : '目標達成には追加努力が必要'}
                </div>
            </div>
            <div style="background: #e5e7eb; border-radius: 8px; height: 20px; margin: 10px 0; overflow: hidden;">
                <div style="background: ${achievable ? '#22c55e' : '#f59e0b'}; height: 100%; width: ${progressPercent}%;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #666;">
                <span>開始: ¥${currentEquity}</span>
                <span style="font-weight: bold; color: ${achievable ? '#166534' : '#991b1b'};">予想: ¥${finalEquity}</span>
                <span>目標: ¥450</span>
            </div>
            ${!achievable ? `
            <div style="margin-top: 10px; padding: 8px; background: #fef3c7; border-radius: 6px; font-size: 11px; color: #92400e;">
                <strong>改善案:</strong>
                <ul style="margin: 4px 0 0 15px; padding: 0;">
                    <li>高単価市場（東京¥40）での販売を増やす</li>
                    <li>製造・販売能力を早めに強化（W6/S6/機6）</li>
                    <li>研究チップで入札勝率UP</li>
                    <li>固定費削減（不要な人員・機械を避ける）</li>
                </ul>
            </div>
            ` : ''}
        </div>
    `;

    // 戦略チップの推奨
    planHtml += `
        <div style="background: #fae8ff; border-radius: 10px; padding: 12px; margin-bottom: 10px;">
            <div style="font-weight: bold; font-size: 13px; color: #a21caf; margin-bottom: 8px;">戦略チップ推奨</div>
            <div style="font-size: 12px; line-height: 1.6;">
                <div>・<strong>研究チップ（青）</strong>: 2-3枚推奨 - 価格競争力が上がり入札で勝ちやすい</div>
                <div>・<strong>教育チップ（緑）</strong>: 1-2枚推奨 - 製造効率向上、人員増やすなら必須</div>
                <div>・<strong>広告チップ（赤）</strong>: 1-2枚推奨 - 販売能力向上、高単価市場狙いに有効</div>
                <div style="margin-top: 6px; color: #7c3aed;">※ 3期以降は繰越チップ(¥20)と特急チップ(¥40)を使い分け</div>
            </div>
        </div>
    `;

    // リスク対策
    planHtml += `
        <div style="background: #fef2f2; border-radius: 10px; padding: 12px;">
            <div style="font-weight: bold; font-size: 13px; color: #dc2626; margin-bottom: 8px;">リスク対策</div>
            <div style="font-size: 12px; line-height: 1.6;">
                <div>・保険チップは常に持っておく（火災・盗難対策）</div>
                <div>・現金は最低¥50-100は維持（緊急借入を避ける）</div>
                <div>・仕掛品・製品は在庫を持ちすぎない（火災リスク軽減）</div>
                <div>・景気変動（逆回り）に備えて行動順を意識</div>
            </div>
        </div>
    `;

    document.getElementById('ai-plan-output').innerHTML = planHtml;
    document.getElementById('ai-plan-output').style.display = 'block';
}

// 各期の行動計画を生成（詳細版）
function generatePeriodPlans(startPeriod, currentEquity, cash, workers, salesmen, machines) {
    const plans = [];
    let equity = currentEquity;
    let w = workers;
    let s = salesmen;
    let m = machines;
    let chips = { research: 0, education: 0, advertising: 0 };

    // 期ごとの目標設定
    const periodTargets = {
        2: { equity: 320, workers: 5, salesmen: 5, machines: 5, chips: { research: 1, education: 1 } },
        3: { equity: 360, workers: 5, salesmen: 5, machines: 5, chips: { research: 2, education: 1 } },
        4: { equity: 400, workers: 6, salesmen: 6, machines: 6, chips: { research: 2, education: 2 } },
        5: { equity: 450, workers: 6, salesmen: 6, machines: 6, chips: { research: 3, education: 2 } }
    };

    for (let period = startPeriod; period <= 5; period++) {
        const maxRows = MAX_ROWS_BY_PERIOD[period];
        const target = periodTargets[period];

        // 推奨会社盤状態
        const targetW = Math.max(w, target.workers);
        const targetS = Math.max(s, target.salesmen);
        const targetM = Math.max(m, target.machines);

        const mfgCap = Math.min(targetW, targetM);
        const salesCap = Math.floor(targetS * 1.5);

        // 詳細な行動リスト生成
        const result = generateDetailedRowActions(period, maxRows, mfgCap, salesCap, targetW, targetS, targetM, w, s, m, chips, target.chips);

        // コスト・収益シミュレーション
        const simulation = simulatePeriod(period, result.actions, mfgCap, salesCap, targetW, targetS, targetM);

        plans.push({
            period,
            targetWorkers: targetW,
            targetSalesmen: targetS,
            targetMachines: targetM,
            mfgCapacity: mfgCap,
            salesCapacity: salesCap,
            targetPQ: simulation.totalPQ,
            targetG: simulation.totalG,
            endEquity: equity + simulation.netProfit,
            actions: result.actions,
            simulation,
            warnings: generateWarnings(period, equity + simulation.netProfit, simulation)
        });

        equity = equity + simulation.netProfit;
        w = targetW;
        s = targetS;
        m = targetM;
        chips = result.endChips;
    }

    return plans;
}

// 詳細な行動リスト生成
function generateDetailedRowActions(period, maxRows, mfgCap, salesCap, targetW, targetS, targetM, currentW, currentS, currentM, chips, targetChips) {
    const actions = [];
    let row = 2;
    let materials = 0;
    let wip = 0;
    let products = 0;
    let currentChips = { ...chips };

    // === フェーズ1: 能力構築（最初の2-4行）===
    const needHire = currentW < targetW || currentS < targetS;
    const needMachine = currentM < targetM;
    const needChips = currentChips.research < (targetChips.research || 0) || currentChips.education < (targetChips.education || 0);

    if (needHire) {
        const hireW = targetW - currentW;
        const hireS = targetS - currentS;
        actions.push({
            row: row++,
            action: '採用',
            note: hireW > 0 && hireS > 0 ? `W+${hireW}, S+${hireS}` : (hireW > 0 ? `W+${hireW}` : `S+${hireS}`),
            cost: (hireW + hireS) * 20,
            category: 'setup'
        });
    }

    if (needMachine) {
        const addMachines = targetM - currentM;
        actions.push({
            row: row++,
            action: '設備投資',
            note: `機械+${addMachines}台（¥${addMachines * 100}）`,
            cost: addMachines * 100,
            category: 'setup'
        });
    }

    if (needChips && row <= 4) {
        const chipType = currentChips.research < (targetChips.research || 0) ? '研究' : '教育';
        actions.push({
            row: row++,
            action: '戦略チップ購入',
            note: `${chipType}チップ`,
            cost: 20,
            category: 'setup'
        });
        if (chipType === '研究') currentChips.research++;
        else currentChips.education++;
    }

    // === フェーズ2: 製販サイクル（メインループ）===
    const cycleRows = 5; // 仕入→投入→完成→販売→（予備）
    const availableRows = maxRows - row - 2; // 最後2行は予備
    const cycles = Math.floor(availableRows / cycleRows);

    // 市場情報（期によって変わる）
    const markets = getMarketPrices(period);

    for (let c = 0; c < Math.min(cycles, 3); c++) {
        // 仕入れ
        const buyQty = mfgCap;
        const cheapMarket = markets.buy.sort((a, b) => a.price - b.price)[0];
        actions.push({
            row: row++,
            action: '材料仕入',
            note: `${cheapMarket.name}¥${cheapMarket.price}×${buyQty}個`,
            cost: cheapMarket.price * buyQty,
            category: 'buy'
        });
        materials += buyQty;

        // 投入（材料→仕掛品）
        actions.push({
            row: row++,
            action: '完成・投入',
            note: `投入: ${buyQty}個→仕掛品`,
            cost: 0,
            category: 'production'
        });
        wip += buyQty;
        materials -= buyQty;

        // 完成（仕掛品→製品）
        actions.push({
            row: row++,
            action: '完成・投入',
            note: `完成: ${buyQty}個→製品`,
            cost: 0,
            category: 'production'
        });
        products += wip;
        wip = 0;

        // 販売
        const sellQty = Math.min(products, salesCap);
        const targetMarket = markets.sell.sort((a, b) => b.price - a.price)[0];
        const revenue = targetMarket.price * sellQty;
        actions.push({
            row: row++,
            action: '商品販売',
            note: `${targetMarket.name}¥${targetMarket.price}×${sellQty}個 = ¥${revenue}`,
            revenue: revenue,
            category: 'sell'
        });
        products -= sellQty;

        // 予備行（リスクカードで使う可能性）
        if (c < cycles - 1 && row < maxRows - 3) {
            actions.push({
                row: row++,
                action: 'DO NOTHING or 予備',
                note: 'リスクカード次第で調整',
                category: 'buffer'
            });
        }
    }

    // === フェーズ3: 終盤調整 ===
    if (row < maxRows - 1 && products > 0) {
        const sellMarket = markets.sell[0];
        actions.push({
            row: row++,
            action: '商品販売',
            note: `残り${products}個を売却`,
            revenue: sellMarket.price * products,
            category: 'sell'
        });
    }

    // 追加チップ購入（余裕があれば）
    if (row < maxRows - 1 && currentChips.research < 3) {
        actions.push({
            row: row++,
            action: '戦略チップ購入',
            note: '研究チップ追加',
            cost: 20,
            category: 'setup'
        });
        currentChips.research++;
    }

    // 期末予告
    actions.push({
        row: `${maxRows}行`,
        action: '期末処理',
        note: '誰かが到達で全社強制終了',
        category: 'end'
    });

    return { actions, endChips: currentChips };
}

// 期間シミュレーション
function simulatePeriod(period, actions, mfgCap, salesCap, workers, salesmen, machines) {
    let totalPQ = 0;
    let totalCost = 0;

    // アクションから収益・コスト集計
    for (const action of actions) {
        if (action.revenue) totalPQ += action.revenue;
        if (action.cost) totalCost += action.cost;
    }

    // 固定費計算
    const baseCost = { 2: 22, 3: 24, 4: 26, 5: 28 };
    const wage = baseCost[period];
    const wageMultiplier = period >= 3 ? 1.15 : 1.0; // 3期以降は平均1.15倍想定
    const adjustedWage = Math.round(wage * wageMultiplier);

    const machineCost = machines * adjustedWage;
    const workerCost = workers * adjustedWage;
    const salesmanCost = salesmen * adjustedWage;
    const personnelCost = (workers + salesmen) * Math.round(adjustedWage / 2);
    const salaryCost = machineCost + workerCost + salesmanCost + personnelCost;

    // チップ費用（推定）
    const chipCost = 40; // 平均

    // 原価計算（売上の約55%想定）
    const materialCost = Math.round(totalPQ * 0.55);

    // 粗利
    const totalG = totalPQ - materialCost;

    // 固定費合計
    const fixedCost = salaryCost + chipCost;

    // 経常利益
    const operatingProfit = totalG - fixedCost;

    // リスク想定（1/5でカード、平均15円損失）
    const estimatedRiskLoss = 15;

    // 税引前利益
    const preTaxProfit = operatingProfit - estimatedRiskLoss;

    // 税金・配当（利益の約50%）
    const taxAndDividend = preTaxProfit > 0 ? Math.round(preTaxProfit * 0.5) : 0;

    // 純利益
    const netProfit = preTaxProfit - taxAndDividend;

    return {
        totalPQ,
        totalG,
        materialCost,
        salaryCost,
        fixedCost,
        operatingProfit,
        estimatedRiskLoss,
        preTaxProfit,
        taxAndDividend,
        netProfit
    };
}

// 市場価格取得（実際のゲームデータに基づく）
function getMarketPrices(period) {
    // 実際の市場データ
    // 仕入れ可能市場: 大阪(15), 名古屋(12), 福岡(14), 広島(13)
    // 販売可能市場: 東京(40), 名古屋(38), 札幌(34), 仙台(32), 大阪(28), 海外(10)
    // 3期以降: 仙台閉鎖、サイコロ4以上で札幌も閉鎖
    // 大阪上限はサイコロで変動(21-26)

    const buyMarkets = [
        { name: '名古屋', price: 12 },
        { name: '広島', price: 13 },
        { name: '福岡', price: 14 },
        { name: '大阪', price: 15 }
    ];

    let sellMarkets;
    if (period === 2) {
        sellMarkets = [
            { name: '東京', price: 40 },
            { name: '名古屋', price: 38 },
            { name: '札幌', price: 34 },
            { name: '仙台', price: 32 },
            { name: '大阪', price: 28 }
        ];
    } else {
        // 3期以降: 仙台閉鎖、大阪上限変動(平均24)
        sellMarkets = [
            { name: '東京', price: 40 },
            { name: '名古屋', price: 38 },
            { name: '札幌', price: 34, note: 'サイコロ4+で閉鎖' },
            { name: '大阪', price: 24, note: '上限変動(21-26)' }
        ];
    }

    return { buy: buyMarkets, sell: sellMarkets };
}

// 警告生成
function generateWarnings(period, endEquity, simulation) {
    const warnings = [];

    if (period === 5 && endEquity < 450) {
        warnings.push(`目標未達の恐れあり（予想: ¥${endEquity}）。売上増加または経費削減が必要。`);
    }

    if (simulation.netProfit < 20) {
        warnings.push('利益が薄い。高単価市場への販売や原価削減を検討。');
    }

    if (period >= 4 && endEquity < 400) {
        warnings.push('ペースが遅い。積極的な行動が必要。');
    }

    return warnings.length > 0 ? warnings.join(' / ') : null;
}

// ============================================
// ゲーム中のAI提案機能
// ============================================

// 現在のゲーム状態からAI提案を表示
function showCurrentGameAIAdvice() {
    if (!gameState || !gameState.companies || !gameState.companies[0]) {
        showToast('ゲームが開始されていません', 'error');
        return;
    }

    const player = gameState.companies[0];
    const period = gameState.currentPeriod;
    const row = player.currentRow || 2;

    // 現在の状態を取得
    const currentState = {
        period: period,
        row: row,
        cash: player.cash,
        equity: player.equity || 300,
        workers: player.workers,
        salesmen: player.salesmen,
        machines: player.machines,
        materials: player.materials,
        wip: player.wip,
        products: player.products,
        chips: player.chips
    };

    // 次のアクション推奨を生成
    const recommendation = generateNextActionRecommendation(currentState);

    const content = `
        <div style="max-height: 70vh; overflow-y: auto; padding: 10px;">
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 12px; border-radius: 10px; margin-bottom: 12px; text-align: center;">
                <div style="font-size: 16px; font-weight: bold;">AIアドバイザー</div>
                <div style="font-size: 11px; opacity: 0.9; margin-top: 4px;">第${period}期 ${row}行目</div>
            </div>

            <!-- 現在の状況分析 -->
            <div style="background: #eff6ff; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-weight: bold; font-size: 12px; color: #1e40af; margin-bottom: 6px;">現在の状況</div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 11px;">
                    <div style="background: white; padding: 4px 6px; border-radius: 4px; text-align: center;">
                        <div style="color: #666;">現金</div>
                        <div style="font-weight: bold;">¥${currentState.cash}</div>
                    </div>
                    <div style="background: white; padding: 4px 6px; border-radius: 4px; text-align: center;">
                        <div style="color: #666;">製品</div>
                        <div style="font-weight: bold;">${currentState.products}個</div>
                    </div>
                    <div style="background: white; padding: 4px 6px; border-radius: 4px; text-align: center;">
                        <div style="color: #666;">目標差</div>
                        <div style="font-weight: bold; color: ${450 - currentState.equity > 100 ? '#dc2626' : '#16a34a'};">¥${450 - currentState.equity}</div>
                    </div>
                </div>
            </div>

            <!-- 推奨アクション -->
            <div style="background: #dcfce7; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-weight: bold; font-size: 12px; color: #166534; margin-bottom: 6px;">推奨アクション</div>
                <div style="background: white; padding: 8px; border-radius: 6px; font-size: 12px;">
                    <div style="font-size: 14px; font-weight: bold; color: #15803d; margin-bottom: 4px;">
                        ${recommendation.action}
                    </div>
                    <div style="color: #374151;">${recommendation.reason}</div>
                </div>
            </div>

            <!-- 戦略ヒント -->
            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-weight: bold; font-size: 12px; color: #92400e; margin-bottom: 6px;">戦略ヒント</div>
                <div style="font-size: 11px; line-height: 1.5;">
                    ${recommendation.tips.map(tip => `<div style="padding: 2px 0;">• ${tip}</div>`).join('')}
                </div>
            </div>

            <!-- 目標までの道筋 -->
            <div style="background: #f3f4f6; border-radius: 8px; padding: 10px;">
                <div style="font-weight: bold; font-size: 12px; color: #374151; margin-bottom: 6px;">450達成への道筋</div>
                <div style="font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>現在自己資本:</span><span style="font-weight: bold;">¥${currentState.equity}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>必要増加額:</span><span style="font-weight: bold; color: #dc2626;">¥${450 - currentState.equity}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>残り期数:</span><span style="font-weight: bold;">${5 - period + 1}期</span>
                    </div>
                    <div style="margin-top: 6px; padding: 6px; background: #dbeafe; border-radius: 4px; font-size: 10px;">
                        期あたり約¥${Math.ceil((450 - currentState.equity) / (5 - period + 1))}の利益が必要
                    </div>
                </div>
            </div>

            <button class="submit-btn" onclick="closeModal()" style="width: 100%; margin-top: 12px; padding: 10px;">閉じる</button>
        </div>
    `;

    showModal('AIアドバイス', content);
}

// 次のアクション推奨を生成
function generateNextActionRecommendation(state) {
    const { period, row, cash, products, materials, wip, workers, salesmen, machines, equity } = state;

    const mfgCapacity = Math.min(workers, machines);
    const salesCapacity = Math.floor(salesmen * 1.5);

    // 優先度判定
    let action = '';
    let reason = '';
    let tips = [];

    // 製品があり、販売能力があれば販売優先
    if (products > 0 && products >= salesCapacity * 0.5) {
        action = '商品販売';
        reason = `製品${products}個あり。東京(¥40)または名古屋(¥38)への販売を推奨。入札で負けないよう研究チップがあると有利。`;
        tips = [
            '高単価市場（東京・名古屋）を狙う',
            '研究チップがあれば入札で有利',
            '他社の製品数をチェックして競合を予測'
        ];
    }
    // 仕掛品があれば完成
    else if (wip > 0) {
        action = '完成・投入（完成）';
        reason = `仕掛品${wip}個を製品にして販売準備。`;
        tips = [
            '次のターンで販売できる',
            '在庫リスク（火災）に注意'
        ];
    }
    // 材料があれば投入
    else if (materials > 0 && mfgCapacity > 0) {
        action = '完成・投入（投入）';
        reason = `材料${materials}個を仕掛品に。製造能力: ${mfgCapacity}個。`;
        tips = [
            `最大${mfgCapacity}個まで投入可能`,
            '教育チップで製造効率UP'
        ];
    }
    // 材料がなければ仕入れ
    else if (materials === 0 && cash >= 12 * mfgCapacity) {
        action = '材料仕入';
        reason = `材料なし。名古屋(¥12)から${mfgCapacity}個仕入れ推奨（費用: ¥${12 * mfgCapacity}）。`;
        tips = [
            '名古屋(¥12)が最安',
            `現金¥${cash}で最大${Math.floor(cash / 12)}個購入可`,
            '仕入れすぎると在庫リスク'
        ];
    }
    // 能力不足なら採用/設備投資
    else if (mfgCapacity < 4 || salesCapacity < 4) {
        if (workers < 4 || salesmen < 4) {
            action = '採用';
            reason = `人員不足。W${workers}/S${salesmen}を強化して製造・販売能力UP。`;
            tips = [
                'ワーカー = 製造能力に直結',
                'セールスマン = 販売能力（×1.5）',
                '教育チップで採用効率UP'
            ];
        } else {
            action = '設備投資';
            reason = `機械${machines}台で製造能力不足。機械追加（¥100/台）を検討。`;
            tips = [
                '機械は固定費になるので計画的に',
                '必要最小限で効率よく'
            ];
        }
    }
    // その他
    else {
        action = 'DO NOTHING または 戦略チップ購入';
        reason = '特に急ぐアクションなし。戦略チップで競争力強化も検討。';
        tips = [
            '研究チップ = 入札で有利',
            '広告チップ = 販売能力UP',
            '余裕があればチップ投資'
        ];
    }

    // 追加ヒント
    if (equity < 350 && period >= 3) {
        tips.push('ペースが遅い！積極的な売上確保が必要');
    }
    if (cash < 50) {
        tips.push('現金が少ない！短期借入に注意');
    }

    return { action, reason, tips };
}

// ゲーム中表示ボタン用のヘルパー
function addAIAdviceButton() {
    // この関数はUIに「AIアドバイス」ボタンを追加する時に使用
}

// グローバル公開
if (typeof window !== 'undefined') {
    window.showCustomGameSetupModal = showCustomGameSetupModal;
    window.startCustomGame = startCustomGame;
    window.showAIActionPlanModal = showAIActionPlanModal;
    window.generateAIActionPlan = generateAIActionPlan;
    window.showCurrentGameAIAdvice = showCurrentGameAIAdvice;
}
