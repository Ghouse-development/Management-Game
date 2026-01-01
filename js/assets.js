/**
 * MG (Management Game) - 設備・雇用関連関数
 *
 * 採用、機械購入・売却、倉庫、配置転換
 */

// ============================================
// Hire modal
function showHireModal() {
    const company = gameState.companies[0];

    const content = `
        <div style="background: linear-gradient(180deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 2px solid #f59e0b;">
            <div style="text-align: center; margin-bottom: 10px;">
                <span style="font-size: 12px; color: #92400e;">採用上限（1ターン）</span>
                <span style="font-size: 24px; font-weight: bold; color: #78350f; display: block;">3名まで</span>
                <span style="font-size: 11px; color: #a16207;">採用費: ¥5/人</span>
            </div>
            <div style="display: flex; justify-content: space-around; text-align: center; margin-top: 10px;">
                <div style="background: #fff; border-radius: 8px; padding: 8px 15px; border: 2px solid #a08060;">
                    <div style="font-size: 10px; color: #5d4037;">現ワーカー</div>
                    <div style="font-size: 20px; font-weight: bold; color: #5d4037;">${company.workers}人</div>
                </div>
                <div style="background: #fff; border-radius: 8px; padding: 8px 15px; border: 2px solid #c44;">
                    <div style="font-size: 10px; color: #c44;">現セールス</div>
                    <div style="font-size: 20px; font-weight: bold; color: #c44;">${company.salesmen}人</div>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
            <div style="background: linear-gradient(180deg, #f5deb3 0%, #deb887 100%); border-radius: 10px; padding: 15px; border: 2px solid #a08060; text-align: center;">
                <div style="font-size: 28px; margin-bottom: 5px;">👷</div>
                <div style="font-size: 14px; font-weight: bold; color: #5d4037; margin-bottom: 8px;">ワーカー</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <button type="button" onclick="adjustHire('workerCount', -1)" class="stepper-btn" style="width: 38px; height: 38px; border-radius: 50%; border: none; background: #5d4037; color: white; font-size: 20px; font-weight: bold; cursor: pointer;">−</button>
                    <input type="number" id="workerCount" value="0" min="0" max="3" readonly style="width: 50px; height: 38px; border-radius: 8px; border: 2px solid #a08060; font-size: 20px; font-weight: bold; text-align: center; background: white; color: #5d4037;">
                    <button type="button" onclick="adjustHire('workerCount', 1)" class="stepper-btn" style="width: 38px; height: 38px; border-radius: 50%; border: none; background: #5d4037; color: white; font-size: 20px; font-weight: bold; cursor: pointer;">+</button>
                </div>
            </div>
            <div style="background: linear-gradient(180deg, #ff6b6b 0%, #ee5a5a 100%); border-radius: 10px; padding: 15px; border: 2px solid #c44; text-align: center;">
                <div style="font-size: 28px; margin-bottom: 5px;">💼</div>
                <div style="font-size: 14px; font-weight: bold; color: #fff; margin-bottom: 8px;">セールスマン</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <button type="button" onclick="adjustHire('salesmanCount', -1)" class="stepper-btn" style="width: 38px; height: 38px; border-radius: 50%; border: none; background: #fff; color: #c44; font-size: 20px; font-weight: bold; cursor: pointer;">−</button>
                    <input type="number" id="salesmanCount" value="0" min="0" max="3" readonly style="width: 50px; height: 38px; border-radius: 8px; border: 2px solid #fff; font-size: 20px; font-weight: bold; text-align: center; background: white; color: #c44;">
                    <button type="button" onclick="adjustHire('salesmanCount', 1)" class="stepper-btn" style="width: 38px; height: 38px; border-radius: 50%; border: none; background: #fff; color: #c44; font-size: 20px; font-weight: bold; cursor: pointer;">+</button>
                </div>
            </div>
        </div>

        <div style="background: #f1f5f9; border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <div>
                <span style="font-size: 12px; color: #64748b;">採用人数: </span>
                <span id="totalHires" style="font-size: 18px; font-weight: bold; color: #1e293b;">0人</span>
            </div>
            <div>
                <span style="font-size: 12px; color: #64748b;">採用費: </span>
                <span id="totalCost" style="font-size: 22px; font-weight: bold; color: #dc2626;">¥0</span>
            </div>
        </div>

        <button class="submit-btn" onclick="hire()" style="width: 100%;">
            👥 採用実行
        </button>
    `;

    showModal('👥 採用', content);

    // Update cost display
    window.updateHireCost = () => {
        const workers = parseInt(document.getElementById('workerCount').value) || 0;
        const salesmen = parseInt(document.getElementById('salesmanCount').value) || 0;
        const total = workers + salesmen;
        const cost = total * 5;
        document.getElementById('totalHires').textContent = `${total}人`;
        document.getElementById('totalCost').textContent = `¥${cost}`;
    };

    window.updateHireCost();
}

// 雇用ステッパー調整
function adjustHire(id, delta) {
    const input = document.getElementById(id);
    if (!input) return;
    const current = parseInt(input.value) || 0;
    const workers = parseInt(document.getElementById('workerCount').value) || 0;
    const salesmen = parseInt(document.getElementById('salesmanCount').value) || 0;
    const currentTotal = workers + salesmen;

    // 合計3名制限のチェック
    if (delta > 0 && currentTotal >= 3) return;

    const newVal = Math.max(0, Math.min(3, current + delta));
    input.value = newVal;
    if (window.updateHireCost) window.updateHireCost();
}

// Hire
function hire() {
    const company = gameState.companies[0];
    const workers = parseInt(document.getElementById('workerCount').value) || 0;
    const salesmen = parseInt(document.getElementById('salesmanCount').value) || 0;
    const total = workers + salesmen;
    
    if (total > 3) {
        alert('合計3名までです！');
        return;
    }
    
    const cost = total * 5;

    // 現金チェック（短期借入で購入は不可）
    if (company.cash < cost) {
        showToast(`現金不足のため採用できません（必要: ¥${cost}、所持: ¥${company.cash}）`, 'error', 4000);
        return;
    }

    company.cash -= cost;
    company.extraLaborCost = (company.extraLaborCost || 0) + cost;  // 採用費は人件費
    company.workers += workers;
    company.salesmen += salesmen;

    // 退職者の補充（再雇用で退職者カウントを減らす）
    if (workers > 0 && company.retiredWorkers > 0) {
        const filled = Math.min(workers, company.retiredWorkers);
        company.retiredWorkers -= filled;
    }
    if (salesmen > 0 && company.retiredSalesmen > 0) {
        const filled = Math.min(salesmen, company.retiredSalesmen);
        company.retiredSalesmen -= filled;
    }

    // 期中最大人員の更新
    const currentTotal = company.workers + company.salesmen;
    if (currentTotal > (company.maxPersonnel || 0)) {
        company.maxPersonnel = currentTotal;
    }

    // 教育チップの効果
    if (company.chips.education > 0) {
        company.workers++;
        company.salesmen++;
        alert('教育チップの効果でワーカー+1、セールス+1！');
    }

    // 行動ログ記録
    logAction(0, '採用', `ワーカー${workers}人, セールス${salesmen}人`, -cost, true);

    closeModal();
    updateDisplay();
    showToast(`ワーカー${workers}人、セールスマン${salesmen}人を採用しました（¥${cost}）`, 'success', 3000);

    // カードを引く（意思決定カードで販売可能）
    drawCard();
}

// Machine modal
function showMachineModal() {
    const company = gameState.companies[0];
    const smallMachines = company.machines.filter(m => m.type === 'small');
    const largeMachines = company.machines.filter(m => m.type === 'large');
    const attachableMachines = smallMachines.filter(m => m.attachments === 0);

    const content = `
        <div style="background: linear-gradient(180deg, #e5e7eb 0%, #d1d5db 100%); border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 2px solid #6b7280;">
            <div style="text-align: center; margin-bottom: 10px;">
                <span style="font-size: 12px; color: #4b5563;">現在の設備</span>
            </div>
            <div style="display: flex; justify-content: space-around; text-align: center;">
                <div style="background: #fff; border-radius: 8px; padding: 8px 15px; border: 2px solid #888;">
                    <div style="font-size: 10px; color: #666;">小型機械</div>
                    <div style="font-size: 20px; font-weight: bold; color: #444;">${smallMachines.length}台</div>
                </div>
                <div style="background: #fff; border-radius: 8px; padding: 8px 15px; border: 2px solid #444;">
                    <div style="font-size: 10px; color: #444;">大型機械</div>
                    <div style="font-size: 20px; font-weight: bold; color: #222;">${largeMachines.length}台</div>
                </div>
                <div style="background: #fff; border-radius: 8px; padding: 8px 15px; border: 2px solid #f97316;">
                    <div style="font-size: 10px; color: #ea580c;">製造能力</div>
                    <div style="font-size: 20px; font-weight: bold; color: #c2410c;">${getManufacturingCapacity(company)}</div>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 15px;">
            <div onclick="selectMachineType('small')" id="machine-small" style="background: linear-gradient(180deg, #888 0%, #666 100%); border-radius: 10px; padding: 15px; border: 3px solid #444; cursor: pointer; display: flex; align-items: center; gap: 15px; transition: all 0.2s;">
                <div style="font-size: 32px;">⚙️</div>
                <div style="flex: 1;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff;">小型機械</div>
                    <div style="font-size: 11px; color: #ddd;">製造能力 +1</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 18px; font-weight: bold; color: #fef08a;">¥100</div>
                </div>
            </div>
            <div onclick="selectMachineType('attachment')" id="machine-attachment" style="background: linear-gradient(180deg, #f97316 0%, #ea580c 100%); border-radius: 10px; padding: 15px; border: 3px solid #c2410c; cursor: ${attachableMachines.length > 0 ? 'pointer' : 'not-allowed'}; display: flex; align-items: center; gap: 15px; transition: all 0.2s; opacity: ${attachableMachines.length > 0 ? '1' : '0.5'};">
                <div style="font-size: 32px;">🔧</div>
                <div style="flex: 1;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff;">アタッチメント</div>
                    <div style="font-size: 11px; color: #fed7aa;">小型機械を能力2に ${attachableMachines.length === 0 ? '（対象なし）' : `（対象: ${attachableMachines.length}台）`}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 18px; font-weight: bold; color: #fff;">¥30</div>
                </div>
            </div>
            <div onclick="selectMachineType('large')" id="machine-large" style="background: linear-gradient(180deg, #555 0%, #333 100%); border-radius: 10px; padding: 15px; border: 3px solid #111; cursor: pointer; display: flex; align-items: center; gap: 15px; transition: all 0.2s;">
                <div style="font-size: 32px;">🏭</div>
                <div style="flex: 1;">
                    <div style="font-size: 14px; font-weight: bold; color: #fff;">大型機械</div>
                    <div style="font-size: 11px; color: #ddd;">製造能力 +4</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 18px; font-weight: bold; color: #fef08a;">¥200</div>
                </div>
            </div>
        </div>

        <input type="hidden" id="machineType" value="small">

        <button class="submit-btn" onclick="buyMachine()" style="width: 100%;">
            ⚙️ 購入実行
        </button>
    `;

    showModal('⚙️ 設備投資', content);

    // 初期選択を視覚的に反映
    setTimeout(() => selectMachineType('small'), 0);
}

// 機械タイプを選択
function selectMachineType(type) {
    const company = gameState.companies[0];
    const attachableMachines = company.machines.filter(m => m.type === 'small' && m.attachments === 0);

    if (type === 'attachment' && attachableMachines.length === 0) {
        return; // アタッチメント対象がない場合は選択不可
    }

    document.getElementById('machineType').value = type;

    // 視覚的な選択状態を更新
    ['small', 'attachment', 'large'].forEach(t => {
        const el = document.getElementById(`machine-${t}`);
        if (el) {
            el.style.transform = t === type ? 'scale(1.02)' : 'scale(1)';
            el.style.boxShadow = t === type ? '0 0 20px rgba(251,191,36,0.5)' : 'none';
        }
    });
}

// Buy machine
function buyMachine() {
    const company = gameState.companies[0];
    const type = document.getElementById('machineType').value;
    
    let cost = 0;
    if (type === 'small') cost = 100;
    else if (type === 'large') cost = 200;
    else if (type === 'attachment') cost = 30;

    // 現金チェック（短期借入で購入は不可）
    if (company.cash < cost) {
        showToast(`現金不足のため購入できません（必要: ¥${cost}、所持: ¥${company.cash}）`, 'error', 4000);
        return;
    }

    if (type === 'attachment') {
        // Find small machine without attachment
        const smallMachine = company.machines.find(m => m.type === 'small' && m.attachments === 0);
        if (!smallMachine) {
            alert('アタッチメントを付けられる小型機械がありません！');
            return;
        }
        smallMachine.attachments = 1;
        company.cash -= cost;
        alert('小型機械にアタッチメントを追加しました');
    } else {
        company.cash -= cost;
        company.machines.push({type: type, attachments: 0});
        showToast(`${type === 'small' ? '小型' : '大型'}機械を購入しました（¥${cost}）`, 'success', 3000);
    }

    closeModal();
    updateDisplay();

    // カードを引く（意思決定カードで販売可能）
    drawCard();
}

// Warehouse modal (無災害倉庫)
function showWarehouseModal() {
    const company = gameState.companies[0];
    const currentWarehouses = company.warehouses || 0;

    if (currentWarehouses >= 2) {
        alert('倉庫は最大2個までです。既に2個所有しています。');
        return;
    }

    // 初期値
    window.warehouseSelection = { count: 1, location: 'materials' };

    let content = '';

    if (currentWarehouses === 0) {
        // 0個所有 → 1個または2個購入可能
        content = `
            <div style="padding: 8px;">
                <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                    <span style="font-weight: bold; color: #92400e;">💰 ¥${company.cash}</span>
                    <span style="font-size: 12px; color: #78350f; margin-left: 10px;">現在: 倉庫${currentWarehouses}個</span>
                </div>

                <div style="font-size: 12px; color: #666; text-align: center; margin-bottom: 10px;">
                    🏪 無災害倉庫: 容量+12個、火災・盗難回避
                </div>

                <!-- 購入数選択 -->
                <div style="margin-bottom: 10px;">
                    <div style="font-size: 12px; color: #374151; margin-bottom: 6px; text-align: center;">購入数</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div onclick="selectWarehouseCount(1)" id="wh-count-1" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 12px; border-radius: 10px; text-align: center; cursor: pointer; border: 3px solid #60a5fa;">
                            <div style="font-size: 18px; font-weight: bold;">1個</div>
                            <div style="font-size: 12px;">¥20</div>
                        </div>
                        <div onclick="selectWarehouseCount(2)" id="wh-count-2" style="background: #374151; color: white; padding: 12px; border-radius: 10px; text-align: center; cursor: pointer; border: 3px solid transparent;">
                            <div style="font-size: 18px; font-weight: bold;">2個</div>
                            <div style="font-size: 12px;">¥40（両方）</div>
                        </div>
                    </div>
                </div>

                <!-- 設置場所選択（1個の場合のみ表示） -->
                <div id="warehouseLocationSection" style="margin-bottom: 10px;">
                    <div style="font-size: 12px; color: #374151; margin-bottom: 6px; text-align: center;">設置場所</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div onclick="selectWarehouseLocation('materials')" id="wh-loc-materials" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 12px; border-radius: 10px; text-align: center; cursor: pointer; border: 3px solid #fbbf24;">
                            <div style="font-size: 14px; font-weight: bold;">📦 材料置場</div>
                            <div style="font-size: 11px;">火災保護</div>
                        </div>
                        <div onclick="selectWarehouseLocation('products')" id="wh-loc-products" style="background: #374151; color: white; padding: 12px; border-radius: 10px; text-align: center; cursor: pointer; border: 3px solid transparent;">
                            <div style="font-size: 14px; font-weight: bold;">🎁 製品置場</div>
                            <div style="font-size: 11px;">盗難保護</div>
                        </div>
                    </div>
                </div>

                <button class="submit-btn" onclick="buyWarehouse()" style="width: 100%; padding: 12px;">🏪 購入（1行使用）</button>
            </div>
        `;
    } else {
        // 1個所有 → 反対側に1個追加のみ
        const otherLocation = company.warehouseLocation === 'materials' ? 'products' : 'materials';
        const otherName = otherLocation === 'materials' ? '材料置場' : '製品置場';
        const otherIcon = otherLocation === 'materials' ? '📦' : '🎁';
        const otherEffect = otherLocation === 'materials' ? '火災保護' : '盗難保護';
        window.warehouseSelection = { count: 1, location: otherLocation };

        content = `
            <div style="padding: 8px;">
                <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                    <span style="font-weight: bold; color: #92400e;">💰 ¥${company.cash}</span>
                    <span style="font-size: 12px; color: #78350f; margin-left: 10px;">倉庫1個（${company.warehouseLocation === 'materials' ? '材料' : '製品'}）</span>
                </div>

                <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 10px; padding: 15px; margin-bottom: 10px; text-align: center;">
                    <div style="font-size: 14px; color: #166534; margin-bottom: 5px;">2個目を設置</div>
                    <div style="font-size: 20px; font-weight: bold; color: #15803d;">${otherIcon} ${otherName}</div>
                    <div style="font-size: 12px; color: #166534;">${otherEffect} / ¥20</div>
                </div>

                <button class="submit-btn" onclick="buyWarehouse()" style="width: 100%; padding: 12px;">🏪 購入（1行使用）</button>
            </div>
        `;
    }

    showModal('無災害倉庫購入', content);
}

// 倉庫購入数選択
function selectWarehouseCount(count) {
    window.warehouseSelection.count = count;
    document.getElementById('wh-count-1').style.background = count === 1 ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151';
    document.getElementById('wh-count-1').style.borderColor = count === 1 ? '#60a5fa' : 'transparent';
    document.getElementById('wh-count-2').style.background = count === 2 ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151';
    document.getElementById('wh-count-2').style.borderColor = count === 2 ? '#60a5fa' : 'transparent';

    // 2個の場合は場所選択を非表示
    const locSection = document.getElementById('warehouseLocationSection');
    if (locSection) {
        locSection.style.display = count === 2 ? 'none' : 'block';
    }
}

// 倉庫設置場所選択
function selectWarehouseLocation(location) {
    window.warehouseSelection.location = location;
    document.getElementById('wh-loc-materials').style.background = location === 'materials' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : '#374151';
    document.getElementById('wh-loc-materials').style.borderColor = location === 'materials' ? '#fbbf24' : 'transparent';
    document.getElementById('wh-loc-products').style.background = location === 'products' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#374151';
    document.getElementById('wh-loc-products').style.borderColor = location === 'products' ? '#34d399' : 'transparent';
}

// Buy warehouse
function buyWarehouse() {
    const company = gameState.companies[0];
    const selection = window.warehouseSelection || { count: 1, location: 'materials' };
    const count = selection.count;
    const location = selection.location;

    const cost = count * 20;

    if (company.warehouses + count > 2) {
        alert('倉庫は最大2個までです！');
        return;
    }

    if (company.cash < cost) {
        showToast('現金が不足しています！', 'danger', 3000);
        return;
    }

    company.cash -= cost;

    if (count === 2) {
        // 2個購入: 両方に設置
        company.warehouses = 2;
        company.warehouseLocation = 'both';  // 両方に設置を示す
    } else {
        // 1個購入
        company.warehouses += 1;
        if (company.warehouses === 1) {
            company.warehouseLocation = location;
        } else {
            // 2個目は反対側に設置（自動）
            company.warehouseLocation = 'both';
        }
    }

    company.extraLaborCost = (company.extraLaborCost || 0) + cost;

    closeModal();
    let locationText;
    if (count === 2 || company.warehouses === 2) {
        locationText = '材料置場と製品置場';
    } else {
        locationText = location === 'materials' ? '材料置場' : '製品置場';
    }
    alert(`無災害倉庫を${locationText}に設置しました（¥${cost}）`);

    // カードを引く
    drawCard();
}

// 倉庫移動モーダル（1個のみ保有時に使用可能）
function showWarehouseMoveModal() {
    const company = gameState.companies[0];

    if (company.warehouses !== 1) {
        alert('倉庫の移動は1個保有時のみ可能です。');
        return;
    }

    const currentLocation = company.warehouseLocation === 'materials' ? '材料置場' : '製品置場';
    const newLocation = company.warehouseLocation === 'materials' ? 'products' : 'materials';
    const newLocationName = newLocation === 'materials' ? '材料置場' : '製品置場';

    // 移動先の容量チェック
    let canMove = true;
    let warningMessage = '';

    if (newLocation === 'materials') {
        // 製品置場→材料置場に移動する場合、製品が10個を超えているか確認
        if (company.products > 10) {
            canMove = false;
            warningMessage = `製品が${company.products}個あります。\n倉庫を移動すると製品置場の容量（10個）を超えてしまいます。`;
        }
    } else {
        // 材料置場→製品置場に移動する場合、材料が10個を超えているか確認
        if (company.materials > 10) {
            canMove = false;
            warningMessage = `材料が${company.materials}個あります。\n倉庫を移動すると材料置場の容量（10個）を超えてしまいます。`;
        }
    }

    const content = `
        <div style="padding: 10px;">
            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 15px;">
                <div style="font-weight: bold; color: #92400e;">現在の倉庫位置</div>
                <div style="font-size: 18px; color: #78350f; margin-top: 5px;">${currentLocation}</div>
            </div>
            <div style="margin-bottom: 15px;">
                <p style="font-size: 14px; color: #444;">倉庫を${newLocationName}に移動しますか？</p>
                <p style="font-size: 12px; color: #0369a1;">※ 移動は何回でも可能で、行を消費しません</p>
                ${!canMove ? `<p style="font-size: 12px; color: #dc2626; margin-top: 10px;">${warningMessage}</p>` : ''}
            </div>
            ${canMove ? `
                <button class="submit-btn" onclick="moveWarehouse('${newLocation}')" style="width: 100%;">
                    ${newLocationName}に移動
                </button>
            ` : `
                <button class="submit-btn" disabled style="width: 100%; background: #ccc; cursor: not-allowed;">
                    移動不可
                </button>
            `}
            <button class="action-btn secondary" onclick="closeModal()" style="width: 100%; margin-top: 10px;">キャンセル</button>
        </div>
    `;

    showModal('倉庫の移動', content);
}

// 倉庫を移動する
function moveWarehouse(newLocation) {
    const company = gameState.companies[0];

    if (company.warehouses !== 1) {
        alert('倉庫の移動は1個保有時のみ可能です。');
        return;
    }

    const newLocationName = newLocation === 'materials' ? '材料置場' : '製品置場';
    company.warehouseLocation = newLocation;

    closeModal();
    alert(`倉庫を${newLocationName}に移動しました。`);
    updateDisplay();
    // 行を消費しないので、ターン選択に戻る
    showTurnStartOptions();
}

// Reassign modal (配置転換)
function showReassignModal() {
    const company = gameState.companies[0];
    window.reassignSelection = { type: 'workerToSales', count: 1 };

    const content = `
        <div style="padding: 8px;">
            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                <span style="font-weight: bold; color: #92400e;">💰 ¥${company.cash}</span>
                <span style="font-size: 12px; margin-left: 10px;">👷${company.workers}人 🧑‍💼${company.salesmen}人</span>
            </div>

            <div style="font-size: 12px; color: #666; text-align: center; margin-bottom: 10px;">配置転換: ¥5/人</div>

            <!-- 転換方向 -->
            <div style="margin-bottom: 10px;">
                <div style="font-size: 12px; color: #374151; margin-bottom: 6px; text-align: center;">転換方向</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div onclick="selectReassignType('workerToSales')" id="reassign-w2s" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 12px; border-radius: 10px; text-align: center; cursor: pointer; border: 3px solid #60a5fa;">
                        <div style="font-size: 14px;">👷 → 🧑‍💼</div>
                        <div style="font-size: 11px;">ワーカー→セールス</div>
                    </div>
                    <div onclick="selectReassignType('salesToWorker')" id="reassign-s2w" style="background: #374151; color: white; padding: 12px; border-radius: 10px; text-align: center; cursor: pointer; border: 3px solid transparent;">
                        <div style="font-size: 14px;">🧑‍💼 → 👷</div>
                        <div style="font-size: 11px;">セールス→ワーカー</div>
                    </div>
                </div>
            </div>

            <!-- 人数選択 -->
            <div style="margin-bottom: 10px;">
                <div style="font-size: 12px; color: #374151; margin-bottom: 6px; text-align: center;">人数</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button onclick="adjustReassignCount(-1)" style="width: 40px; height: 40px; border-radius: 8px; border: none; background: #6b7280; color: white; font-size: 20px; cursor: pointer;">−</button>
                    <div id="reassignCountDisplay" style="min-width: 60px; padding: 10px 15px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 10px; text-align: center; color: white; font-size: 18px; font-weight: bold;">1人</div>
                    <button onclick="adjustReassignCount(1)" style="width: 40px; height: 40px; border-radius: 8px; border: none; background: #6b7280; color: white; font-size: 20px; cursor: pointer;">+</button>
                </div>
                <div id="reassignCostDisplay" style="font-size: 12px; color: #92400e; text-align: center; margin-top: 5px;">費用: ¥5</div>
            </div>

            <button class="submit-btn" onclick="reassign()" style="width: 100%; padding: 12px;">🔄 配置転換</button>
        </div>
    `;

    showModal('配置転換', content);
}

// 配置転換方向選択
function selectReassignType(type) {
    window.reassignSelection.type = type;
    document.getElementById('reassign-w2s').style.background = type === 'workerToSales' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151';
    document.getElementById('reassign-w2s').style.borderColor = type === 'workerToSales' ? '#60a5fa' : 'transparent';
    document.getElementById('reassign-s2w').style.background = type === 'salesToWorker' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#374151';
    document.getElementById('reassign-s2w').style.borderColor = type === 'salesToWorker' ? '#60a5fa' : 'transparent';
}

// 配置転換人数調整
function adjustReassignCount(delta) {
    const company = gameState.companies[0];
    const maxCount = window.reassignSelection.type === 'workerToSales' ? company.workers : company.salesmen;
    window.reassignSelection.count = Math.max(1, Math.min(window.reassignSelection.count + delta, Math.min(maxCount, 5)));
    document.getElementById('reassignCountDisplay').textContent = window.reassignSelection.count + '人';
    document.getElementById('reassignCostDisplay').textContent = '費用: ¥' + (window.reassignSelection.count * 5);
}

// Reassign
function reassign() {
    const company = gameState.companies[0];
    const selection = window.reassignSelection || { type: 'workerToSales', count: 1 };
    const type = selection.type;
    const count = selection.count;
    const cost = count * 5;

    if (company.cash < cost) {
        showToast('現金が不足しています！', 'danger', 3000);
        return;
    }

    if (type === 'workerToSales') {
        if (company.workers < count) {
            alert('ワーカーが不足しています！');
            return;
        }
        company.workers -= count;
        company.salesmen += count;
    } else {
        if (company.salesmen < count) {
            alert('セールスマンが不足しています！');
            return;
        }
        company.salesmen -= count;
        company.workers += count;
    }

    company.cash -= cost;

    // 配置転換費用をFに計上
    company.extraLaborCost = (company.extraLaborCost || 0) + cost;

    closeModal();
    updateDisplay();

    // カードを引く（意思決定カードで販売可能）
    drawCard();
}

// Sell machine modal
function showSellMachineModal() {
    const company = gameState.companies[0];

    if (company.machines.length === 0) {
        alert('売却する機械がありません！');
        return;
    }

    window.machineSelection = { index: 0 };

    const machineCards = company.machines.map((m, i) => {
        const name = m.type === 'small' ?
            (m.attachments > 0 ? '小型+アタッチ' : '小型機械') : '大型機械';
        const icon = m.type === 'small' ? '⚙️' : '🏭';
        const bookValue = calculateMachineBookValue(m, gameState.currentPeriod);
        const salePrice = Math.floor(bookValue * 0.7);
        const isSelected = i === 0;
        return `
            <div onclick="selectMachineToSell(${i})" id="machine-sell-${i}" style="background: ${isSelected ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : '#374151'}; color: white; padding: 12px; border-radius: 10px; text-align: center; cursor: pointer; border: 3px solid ${isSelected ? '#f87171' : 'transparent'};">
                <div style="font-size: 20px;">${icon}</div>
                <div style="font-size: 13px; font-weight: bold;">${name}</div>
                <div style="font-size: 11px; opacity: 0.9;">簿価 ¥${bookValue}</div>
                <div style="font-size: 14px; font-weight: bold; color: #fef08a;">→ ¥${salePrice}</div>
            </div>
        `;
    }).join('');

    const content = `
        <div style="padding: 8px;">
            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                <span style="font-weight: bold; color: #92400e;">💰 ¥${company.cash}</span>
            </div>

            <div style="font-size: 12px; color: #666; text-align: center; margin-bottom: 10px;">
                売却額 = 簿価 × 70%
            </div>

            <div style="display: grid; grid-template-columns: repeat(${Math.min(company.machines.length, 3)}, 1fr); gap: 8px; margin-bottom: 10px;">
                ${machineCards}
            </div>

            <button class="submit-btn" onclick="sellMachine()" style="width: 100%; padding: 12px; background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);">🗑️ 売却する</button>
        </div>
    `;

    showModal('機械売却', content);
}

// 機械選択
function selectMachineToSell(index) {
    const company = gameState.companies[0];
    window.machineSelection.index = index;
    company.machines.forEach((m, i) => {
        const el = document.getElementById(`machine-sell-${i}`);
        if (el) {
            el.style.background = i === index ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : '#374151';
            el.style.borderColor = i === index ? '#f87171' : 'transparent';
        }
    });
}

// Calculate machine book value based on depreciation
function calculateMachineBookValue(machine, currentPeriod) {
    const original = machine.type === 'small' ?
        (machine.attachments > 0 ? 130 : 100) : 200;

    // 減価償却費を計算（1期=0、2期からカウント）
    let totalDepreciation = 0;
    for (let period = 2; period <= currentPeriod; period++) {
        if (machine.type === 'small') {
            if (machine.attachments > 0) {
                totalDepreciation += period === 2 ? DEPRECIATION.smallWithAttachment.period2 : DEPRECIATION.smallWithAttachment.period3plus;
            } else {
                totalDepreciation += period === 2 ? DEPRECIATION.small.period2 : DEPRECIATION.small.period3plus;
            }
        } else {
            totalDepreciation += period === 2 ? DEPRECIATION.large.period2 : DEPRECIATION.large.period3plus;
        }
    }

    return Math.max(0, original - totalDepreciation);
}

// Sell machine
function sellMachine() {
    const company = gameState.companies[0];
    const machineIndex = window.machineSelection?.index || 0;
    const machine = company.machines[machineIndex];

    const bookValue = calculateMachineBookValue(machine, gameState.currentPeriod);
    const salePrice = Math.floor(bookValue * 0.7);
    const loss = bookValue - salePrice;
    
    company.cash += salePrice;
    company.machines.splice(machineIndex, 1);
    
    // 特別損失として期末に反映
    company.specialLoss = (company.specialLoss || 0) + loss;
    
    closeModal();
    alert(`機械を¥${salePrice}で売却しました（特別損失¥${loss}）`);
    
    // カードを引く
    drawCard();
}

