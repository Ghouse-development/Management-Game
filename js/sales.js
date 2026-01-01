/**
 * MG (Management Game) - 販売・市場関連関数
 *
 * 販売モード、市場操作、入札処理
 */

// ============================================
// 販売モード
// ============================================

// 販売モードを開始
function enterSalesMode() {
    const company = gameState.companies[0];

    if (company.products <= 0) {
        showToast('製品在庫がありません', 'danger', 3000);
        return;
    }

    // 販売方式選択モーダルを表示
    showSalesTypeModal();
}

// 販売方式選択モーダル
function showSalesTypeModal() {
    const company = gameState.companies[0];
    const salesCapacity = getSalesCapacity(company);
    const availableMarkets = gameState.markets.filter(m => !m.closed && m.needsBid);
    const canTwoMarkets = availableMarkets.length >= 2 && company.products >= 2;

    const content = `
        <div style="padding: 10px;">
            <div style="background: #fef3c7; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
                <div style="font-weight: bold; color: #92400e;">製品在庫: ${company.products}個 / 販売能力: ${salesCapacity}</div>
            </div>

            <div style="display: grid; gap: 12px;">
                <button onclick="startSingleMarketSale()" class="submit-btn" style="padding: 15px; font-size: 16px;">
                    <div style="font-weight: bold;">📍 1市場で販売</div>
                    <div style="font-size: 12px; opacity: 0.8;">1行使用</div>
                </button>

                ${canTwoMarkets ? `
                <button onclick="startTwoMarketSale()" class="submit-btn" style="padding: 15px; font-size: 16px; background: linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%);">
                    <div style="font-weight: bold;">📍📍 2市場同時販売</div>
                    <div style="font-size: 12px; opacity: 0.8;">同価格・1行使用（低い上限価格適用）</div>
                </button>

                <button onclick="startSeparateTwoMarketSale()" class="submit-btn" style="padding: 15px; font-size: 16px; background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%);">
                    <div style="font-weight: bold;">📍+📍 2市場別々販売</div>
                    <div style="font-size: 12px; opacity: 0.8;">別価格・2行使用</div>
                </button>
                ` : `
                <div style="background: #f3f4f6; border-radius: 8px; padding: 12px; text-align: center; color: #6b7280;">
                    2市場販売には入札市場が2つ以上必要です
                </div>
                `}
            </div>

            <button onclick="closeModal(); showTurnStartOptions();" class="submit-btn" style="margin-top: 15px; background: linear-gradient(180deg, #6b7280 0%, #4b5563 100%);">
                ← 戻る
            </button>
        </div>
    `;

    showModal('💰 販売方式を選択', content);
}

// 1市場販売モード開始
function startSingleMarketSale() {
    const company = gameState.companies[0];
    gameState.salesMode = true;
    gameState.buyMode = false;
    gameState.twoMarketMode = false;
    closeModal();
    renderMarketsBoard();

    const instruction = document.createElement('div');
    instruction.className = 'market-instruction';
    instruction.id = 'marketInstruction';
    instruction.innerHTML = `
        <span>💰 販売したい市場をタップしてください（在庫: ${company.products}個）</span>
        <button class="cancel-mode-btn" onclick="cancelMarketMode()">キャンセル</button>
    `;
    document.body.appendChild(instruction);
}

// 2市場同時販売モード開始
function startTwoMarketSale() {
    const company = gameState.companies[0];
    gameState.salesMode = true;
    gameState.buyMode = false;
    gameState.twoMarketMode = 'simultaneous';
    gameState.selectedMarkets = [];
    closeModal();
    renderMarketsBoard();

    const instruction = document.createElement('div');
    instruction.className = 'market-instruction';
    instruction.id = 'marketInstruction';
    instruction.style.background = 'linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%)';
    instruction.innerHTML = `
        <span>📍📍 2つの市場を選択してください（同価格・1行）</span>
        <button class="cancel-mode-btn" onclick="cancelMarketMode()">キャンセル</button>
    `;
    document.body.appendChild(instruction);
}

// 2市場別々販売モード開始
function startSeparateTwoMarketSale() {
    const company = gameState.companies[0];
    gameState.salesMode = true;
    gameState.buyMode = false;
    gameState.twoMarketMode = 'separate';
    gameState.selectedMarkets = [];
    closeModal();
    renderMarketsBoard();

    const instruction = document.createElement('div');
    instruction.className = 'market-instruction';
    instruction.id = 'marketInstruction';
    instruction.style.background = 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)';
    instruction.innerHTML = `
        <span>📍+📍 2つの市場を選択してください（別価格・2行）</span>
        <button class="cancel-mode-btn" onclick="cancelMarketMode()">キャンセル</button>
    `;
    document.body.appendChild(instruction);
}

// ============================================
// 材料購入モーダル（複数市場対応）
// ============================================
function showMaterialPurchaseModal() {
    const company = gameState.companies[0];
    const remainingRows = gameState.maxRows - company.currentRow + 1;

    // 最も行数を使っている会社を取得
    const maxRowCompany = gameState.companies.reduce((max, c) =>
        (c.currentRow || 1) > (max.currentRow || 1) ? c : max
    );
    const isHighestRow = company === maxRowCompany;

    // 購入可能な市場を取得（閉鎖されていない市場のみ）
    const availableMarkets = gameState.markets.filter(m => !m.closed && m.currentStock > 0);

    // 3期以降は1市場からの購入上限 = 製造能力
    const mfgCapacity = getManufacturingCapacity(company);
    const isPeriod2 = gameState.currentPeriod === 2;

    // 市場カードを生成
    let marketCards = '';
    availableMarkets.forEach((market, i) => {
        const marketIndex = gameState.markets.indexOf(market);
        // 2期: 制限なし、3期以降: 製造能力が上限
        const maxPerMarket = isPeriod2 ? 99 : mfgCapacity;
        const maxBuy = Math.min(market.currentStock, 10 - company.materials, maxPerMarket);

        // 市場の色を決定
        const marketColors = {
            '仙台': { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: '#047857' },
            '札幌': { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: '#1d4ed8' },
            '東京': { bg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: '#b91c1c' },
            '名古屋': { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: '#b45309' },
            '大阪': { bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', border: '#6d28d9' },
            '福岡': { bg: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', border: '#be185d' }
        };
        const colors = marketColors[market.name] || { bg: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)', border: '#374151' };

        marketCards += `
            <div style="
                background: ${colors.bg};
                border: 3px solid ${colors.border};
                border-radius: 12px;
                padding: 12px;
                color: white;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            ">
                <div style="text-align: center; margin-bottom: 8px;">
                    <div style="font-weight: bold; font-size: 16px;">${market.name}</div>
                    <div style="font-size: 12px; opacity: 0.9;">在庫: ${market.currentStock}個</div>
                </div>
                <div style="background: rgba(255,255,255,0.2); border-radius: 8px; padding: 8px; text-align: center; margin-bottom: 8px;">
                    <div style="font-size: 11px; opacity: 0.8;">仕入価格</div>
                    <div style="font-size: 20px; font-weight: bold;">¥${market.buyPrice}</div>
                </div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button onclick="adjustMaterialQty(${marketIndex}, -1)" style="
                        width: 36px; height: 36px;
                        border: none; border-radius: 50%;
                        background: rgba(255,255,255,0.3);
                        color: white; font-size: 20px; font-weight: bold;
                        cursor: pointer;
                    ">−</button>
                    <div style="
                        min-width: 50px; text-align: center;
                        background: rgba(255,255,255,0.9); color: #1e293b;
                        padding: 6px 12px; border-radius: 8px;
                        font-size: 18px; font-weight: bold;
                    ">
                        <span id="qty_${marketIndex}">0</span>個
                    </div>
                    <button onclick="adjustMaterialQty(${marketIndex}, 1)" style="
                        width: 36px; height: 36px;
                        border: none; border-radius: 50%;
                        background: rgba(255,255,255,0.3);
                        color: white; font-size: 20px; font-weight: bold;
                        cursor: pointer;
                    ">+</button>
                </div>
                <div style="text-align: center; margin-top: 6px; font-size: 12px;">
                    <span id="cost_${marketIndex}">¥0</span>
                    <input type="hidden" id="market_${marketIndex}" value="0" data-price="${market.buyPrice}" data-max="${maxBuy}">
                </div>
            </div>
        `;
    });

    const content = `
        <div style="padding: 10px;">
            <!-- 会社盤（ミニ表示） -->
            <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #22c55e; border-radius: 12px; padding: 12px; margin-bottom: 15px;">
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; font-size: 11px;">
                    <div style="background: rgba(255,255,255,0.7); padding: 6px; border-radius: 6px;">
                        <div style="color: #6b7280;">材料</div>
                        <div style="font-weight: bold; font-size: 14px;" id="materialDisplay">${company.materials}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.7); padding: 6px; border-radius: 6px;">
                        <div style="color: #6b7280;">仕掛</div>
                        <div style="font-weight: bold; font-size: 14px;">${company.wip}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.7); padding: 6px; border-radius: 6px;">
                        <div style="color: #6b7280;">製品</div>
                        <div style="font-weight: bold; font-size: 14px;">${company.products}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.7); padding: 6px; border-radius: 6px;">
                        <div style="color: #6b7280;">現金</div>
                        <div style="font-weight: bold; font-size: 14px; color: #166534;" id="cashDisplay">¥${company.cash}</div>
                    </div>
                </div>
                <div style="display: flex; justify-content: center; gap: 8px; margin-top: 8px; font-size: 10px;">
                    <span style="color: #3b82f6;">🔬${company.chips.research || 0}</span>
                    <span style="color: #eab308;">📚${company.chips.education || 0}</span>
                    <span style="color: #ef4444;">📢${company.chips.advertising || 0}</span>
                    <span style="color: #666;">| W${company.workers} 機${company.machines.length} S${company.salesmen}</span>
                </div>
            </div>

            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 15px;">
                <div style="font-size: 12px; color: #78350f;">残り行数: ${remainingRows}行 / 材料上限: 10個</div>
                ${!isPeriod2 ? `<div style="font-size: 12px; color: #0369a1;">製造能力: ${mfgCapacity} (1市場あたり${mfgCapacity}個まで)</div>` : ''}
                ${isHighestRow ? `<div style="font-size: 12px; color: #dc2626; margin-top: 5px;">⚠️ あなたは行数トップです。2市場購入は慎重に。</div>` : ''}
                <div style="font-size: 11px; color: #666; margin-top: 5px;">※複数市場から購入 = 市場数×1行使用</div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 15px;">
                ${marketCards}
            </div>

            <div style="background: #e0f2fe; border-radius: 8px; padding: 10px; margin-bottom: 15px; text-align: center;">
                <div style="font-size: 12px; color: #0369a1;">合計</div>
                <div style="font-size: 24px; font-weight: bold; color: #1e40af;" id="totalCost">¥0</div>
                <div style="font-size: 12px; color: #666;" id="totalQty">0個 / 使用行数: 0行</div>
            </div>

            <button class="submit-btn" onclick="buyMaterialsFromMultiple()">購入実行</button>
        </div>
    `;

    showModal('📦 材料購入', content);
}

// 材料購入数量を調整
function adjustMaterialQty(marketIndex, delta) {
    const input = document.getElementById(`market_${marketIndex}`);
    const qtySpan = document.getElementById(`qty_${marketIndex}`);
    const costSpan = document.getElementById(`cost_${marketIndex}`);

    const currentQty = parseInt(input.value) || 0;
    const maxQty = parseInt(input.dataset.max) || 0;
    const price = parseInt(input.dataset.price) || 0;

    const newQty = Math.max(0, Math.min(maxQty, currentQty + delta));
    input.value = newQty;
    qtySpan.textContent = newQty;
    costSpan.textContent = `¥${newQty * price}`;

    updateMaterialPurchaseTotal();
}

// 材料購入合計を更新
function updateMaterialPurchaseTotal() {
    const company = gameState.companies[0];
    let totalCost = 0;
    let totalQty = 0;
    let marketCount = 0;

    gameState.markets.forEach((market, index) => {
        const input = document.getElementById(`market_${index}`);
        if (input) {
            const qty = parseInt(input.value) || 0;
            const price = parseInt(input.dataset.price) || 0;
            totalQty += qty;
            totalCost += qty * price;
            if (qty > 0) marketCount++;
        }
    });

    document.getElementById('totalCost').textContent = `¥${totalCost}`;
    document.getElementById('totalQty').textContent = `${totalQty}個 / 使用行数: ${marketCount}行`;

    // 現金表示を更新（購入後の残高をプレビュー）
    const cashDisplay = document.getElementById('cashDisplay');
    const remaining = company.cash - totalCost;
    cashDisplay.textContent = `¥${remaining}`;
    cashDisplay.style.color = remaining < 0 ? '#dc2626' : '#166534';

    // 材料表示を更新（購入後の数量をプレビュー）
    const materialDisplay = document.getElementById('materialDisplay');
    materialDisplay.textContent = company.materials + totalQty;
}

// ============================================
// 購入モード
// ============================================

// 購入モードを開始（方式選択モーダルを表示）
function enterBuyMode() {
    showBuyTypeModal();
}

// 購入方式選択モーダル
function showBuyTypeModal() {
    const company = gameState.companies[0];
    const maxMaterialCapacity = getMaterialCapacity(company);
    const spaceAvailable = maxMaterialCapacity - company.materials;
    const availableMarkets = gameState.markets.filter(m => !m.closed && m.currentStock > 0);
    const canTwoMarkets = availableMarkets.length >= 2 && spaceAvailable >= 2 && company.cash >= 20;
    const rowsRemaining = gameState.maxRows - (company.currentRow || 1) + 1;

    const content = `
        <div style="padding: 10px;">
            <div style="background: #dcfce7; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
                <div style="font-weight: bold; color: #166534;">現金: ¥${company.cash} / 材料置場: ${company.materials}/${maxMaterialCapacity}個</div>
            </div>

            <div style="display: grid; gap: 12px;">
                <button onclick="startSingleMarketBuy()" class="submit-btn" style="padding: 15px; font-size: 16px; background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);">
                    <div style="font-weight: bold;">📦 1市場から購入</div>
                    <div style="font-size: 12px; opacity: 0.8;">1行使用</div>
                </button>

                ${canTwoMarkets && rowsRemaining >= 2 ? `
                <button onclick="startTwoMarketBuy()" class="submit-btn" style="padding: 15px; font-size: 16px; background: linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%);">
                    <div style="font-weight: bold;">📦📦 2市場から購入</div>
                    <div style="font-size: 12px; opacity: 0.8;">2行使用（各市場から別々に購入）</div>
                </button>
                ` : `
                <div style="background: #f3f4f6; border-radius: 8px; padding: 12px; text-align: center; color: #6b7280; font-size: 13px;">
                    ${rowsRemaining < 2 ? '2市場購入には2行必要です' :
                      spaceAvailable < 2 ? '材料置場の空きが不足' :
                      company.cash < 20 ? '現金が不足しています' :
                      '在庫のある市場が2つ以上必要です'}
                </div>
                `}
            </div>

            <button onclick="closeModal(); showTurnStartOptions();" class="submit-btn" style="margin-top: 15px; background: linear-gradient(180deg, #6b7280 0%, #4b5563 100%);">
                ← 戻る
            </button>
        </div>
    `;

    showModal('📦 購入方式を選択', content);
}

// 1市場購入モード開始
function startSingleMarketBuy() {
    const company = gameState.companies[0];
    gameState.buyMode = true;
    gameState.salesMode = false;
    gameState.twoMarketBuyMode = false;
    closeModal();
    renderMarketsBoard();

    const instruction = document.createElement('div');
    instruction.className = 'market-instruction buy-mode';
    instruction.id = 'marketInstruction';
    instruction.innerHTML = `
        <span>📦 材料を購入する市場をタップしてください（現金: ¥${company.cash}）</span>
        <button class="cancel-mode-btn" onclick="cancelMarketMode()">キャンセル</button>
    `;
    document.body.appendChild(instruction);
}

// 2市場購入モード開始
function startTwoMarketBuy() {
    const company = gameState.companies[0];
    gameState.buyMode = true;
    gameState.salesMode = false;
    gameState.twoMarketBuyMode = true;
    gameState.selectedMarkets = [];
    closeModal();
    renderMarketsBoard();

    const instruction = document.createElement('div');
    instruction.className = 'market-instruction buy-mode';
    instruction.id = 'marketInstruction';
    instruction.innerHTML = `
        <span>📦📦 2つの市場を選択 (0/2)（現金: ¥${company.cash}）</span>
        <button class="cancel-mode-btn" onclick="cancelMarketMode()">キャンセル</button>
    `;
    document.body.appendChild(instruction);
}

// 2市場購入の選択インストラクション更新
function updateTwoMarketBuyInstruction() {
    const instruction = document.getElementById('marketInstruction');
    if (instruction) {
        const selected = gameState.selectedMarkets || [];
        const marketNames = selected.map(i => gameState.markets[i].name).join('、');
        const company = gameState.companies[0];
        instruction.innerHTML = `
            <span>📦📦 2つの市場を選択 (${selected.length}/2) ${marketNames ? '- ' + marketNames : ''}（現金: ¥${company.cash}）</span>
            <button class="cancel-mode-btn" onclick="cancelMarketMode()">キャンセル</button>
        `;
    }
}

// 2市場購入モーダル表示
function showTwoMarketBuyModal() {
    const company = gameState.companies[0];
    const market1 = gameState.markets[gameState.selectedMarkets[0]];
    const market2 = gameState.markets[gameState.selectedMarkets[1]];
    const maxMaterialCapacity = getMaterialCapacity(company);
    const spaceAvailable = maxMaterialCapacity - company.materials;

    // 各市場からの最大購入数
    const maxFromMarket1 = Math.min(market1.currentStock, Math.floor(company.cash / market1.buyPrice), spaceAvailable);
    const maxFromMarket2 = Math.min(market2.currentStock, Math.floor(company.cash / market2.buyPrice), spaceAvailable);

    // 初期値をグローバルに保存
    window.twoMarketBuyData = {
        qty1: 0, qty2: 0,
        max1: maxFromMarket1, max2: maxFromMarket2,
        price1: market1.buyPrice, price2: market2.buyPrice,
        spaceAvailable: spaceAvailable
    };

    const content = `
        <div style="padding: 8px;">
            <div style="background: linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%); border-radius: 10px; padding: 10px; margin-bottom: 10px; color: white; text-align: center;">
                <div style="font-weight: bold; font-size: 15px;">2市場から購入</div>
                <div style="font-size: 11px;">各市場から別々に購入（2行使用）</div>
            </div>

            <div style="background: #f1f5f9; border-radius: 6px; padding: 8px; margin-bottom: 8px; text-align: center;">
                <span style="font-weight: bold; color: #1e293b;">💰 ¥${company.cash} / 📦 空き${spaceAvailable}個</span>
            </div>

            <!-- 1つ目の市場 -->
            <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 10px; padding: 10px; margin-bottom: 8px;">
                <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">🟢 ${market1.name}（¥${market1.buyPrice}/個・在庫${market1.currentStock}個）</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button onclick="adjustTwoMarketBuyQty(1, -1)" style="width: 36px; height: 36px; border-radius: 8px; border: none; background: #22c55e; color: white; font-size: 18px; cursor: pointer;">−</button>
                    <div id="twoMarketBuyQty1" style="min-width: 50px; padding: 8px; background: white; border-radius: 8px; text-align: center; font-weight: bold; font-size: 18px;">0</div>
                    <button onclick="adjustTwoMarketBuyQty(1, 1)" style="width: 36px; height: 36px; border-radius: 8px; border: none; background: #22c55e; color: white; font-size: 18px; cursor: pointer;">+</button>
                    <span id="twoMarketBuyCost1" style="font-weight: bold; color: #166534;">¥0</span>
                </div>
            </div>

            <!-- 2つ目の市場 -->
            <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-radius: 10px; padding: 10px; margin-bottom: 8px;">
                <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">🔵 ${market2.name}（¥${market2.buyPrice}/個・在庫${market2.currentStock}個）</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button onclick="adjustTwoMarketBuyQty(2, -1)" style="width: 36px; height: 36px; border-radius: 8px; border: none; background: #3b82f6; color: white; font-size: 18px; cursor: pointer;">−</button>
                    <div id="twoMarketBuyQty2" style="min-width: 50px; padding: 8px; background: white; border-radius: 8px; text-align: center; font-weight: bold; font-size: 18px;">0</div>
                    <button onclick="adjustTwoMarketBuyQty(2, 1)" style="width: 36px; height: 36px; border-radius: 8px; border: none; background: #3b82f6; color: white; font-size: 18px; cursor: pointer;">+</button>
                    <span id="twoMarketBuyCost2" style="font-weight: bold; color: #1d4ed8;">¥0</span>
                </div>
            </div>

            <!-- 合計 -->
            <div style="background: #fef3c7; border-radius: 8px; padding: 10px; margin-bottom: 10px; text-align: center;">
                <div style="font-size: 13px; color: #92400e;">合計</div>
                <div style="font-size: 20px; font-weight: bold; color: #78350f;">
                    <span id="twoMarketBuyTotalQty">0</span>個 / <span id="twoMarketBuyTotalCost">¥0</span>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <button onclick="cancelMarketMode()" class="submit-btn" style="background: linear-gradient(180deg, #6b7280 0%, #4b5563 100%);">
                    キャンセル
                </button>
                <button id="twoMarketBuyExecuteBtn" onclick="executeTwoMarketBuy()" class="submit-btn" style="background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);" disabled>
                    📦 購入実行
                </button>
            </div>
        </div>
    `;

    showModal('2市場購入', content);
}

// 2市場購入の数量調整
function adjustTwoMarketBuyQty(marketNum, delta) {
    const data = window.twoMarketBuyData;
    const company = gameState.companies[0];

    if (marketNum === 1) {
        const newQty = Math.max(0, Math.min(data.max1, data.qty1 + delta));
        // 現金と空き容量のチェック
        const totalCost = newQty * data.price1 + data.qty2 * data.price2;
        const totalQty = newQty + data.qty2;
        if (totalCost <= company.cash && totalQty <= data.spaceAvailable) {
            data.qty1 = newQty;
        }
    } else {
        const newQty = Math.max(0, Math.min(data.max2, data.qty2 + delta));
        const totalCost = data.qty1 * data.price1 + newQty * data.price2;
        const totalQty = data.qty1 + newQty;
        if (totalCost <= company.cash && totalQty <= data.spaceAvailable) {
            data.qty2 = newQty;
        }
    }

    // 表示更新
    document.getElementById('twoMarketBuyQty1').textContent = data.qty1;
    document.getElementById('twoMarketBuyQty2').textContent = data.qty2;
    document.getElementById('twoMarketBuyCost1').textContent = `¥${data.qty1 * data.price1}`;
    document.getElementById('twoMarketBuyCost2').textContent = `¥${data.qty2 * data.price2}`;
    document.getElementById('twoMarketBuyTotalQty').textContent = data.qty1 + data.qty2;
    document.getElementById('twoMarketBuyTotalCost').textContent = `¥${data.qty1 * data.price1 + data.qty2 * data.price2}`;

    // 両市場から購入する場合のみ実行ボタンを有効化
    const executeBtn = document.getElementById('twoMarketBuyExecuteBtn');
    executeBtn.disabled = !(data.qty1 > 0 && data.qty2 > 0);
}

// 2市場購入実行
function executeTwoMarketBuy() {
    const company = gameState.companies[0];
    const data = window.twoMarketBuyData;
    const market1 = gameState.markets[gameState.selectedMarkets[0]];
    const market2 = gameState.markets[gameState.selectedMarkets[1]];

    const totalCost = data.qty1 * data.price1 + data.qty2 * data.price2;
    const totalQty = data.qty1 + data.qty2;

    // 最終チェック
    if (company.cash < totalCost) {
        showToast('現金が不足しています', 'error', 3000);
        return;
    }

    const maxMaterialCapacity = getMaterialCapacity(company);
    if (company.materials + totalQty > maxMaterialCapacity) {
        showToast('材料置場の容量を超えます', 'error', 3000);
        return;
    }

    // 購入実行
    company.cash -= totalCost;
    company.materials += totalQty;
    company.totalMaterialCost += totalCost;

    // 市場在庫を減らす
    market1.currentStock -= data.qty1;
    market2.currentStock -= data.qty2;

    // ログ記録
    const details = `${market1.name}¥${market1.buyPrice}×${data.qty1}, ${market2.name}¥${market2.buyPrice}×${data.qty2}`;
    logAction(0, '材料購入（2市場）', details, -totalCost, true);

    // 2行使用（1行はendTurnで加算されるので、ここでは1行だけ追加）
    company.currentRow = (company.currentRow || 1) + 1;
    gameState.currentRow += 1;

    showToast(`2市場から合計${totalQty}個購入（¥${totalCost}）`, 'success', 3000);

    closeModal();
    gameState.twoMarketBuyMode = false;
    gameState.selectedMarkets = [];
    updateDisplay();
    endTurn();
}

// 市場選択モードをキャンセル
function cancelMarketMode() {
    gameState.salesMode = false;
    gameState.buyMode = false;
    gameState.twoMarketMode = false;
    gameState.twoMarketBuyMode = false;
    gameState.selectedMarkets = [];
    gameState.pendingSeparateBids = null;
    const instruction = document.getElementById('marketInstruction');
    if (instruction) instruction.remove();
    renderMarketsBoard();
    showTurnStartOptions();
}

// ============================================
// 市場タイルクリック処理
// ============================================

// 市場タイルがクリックされた時
function onMarketTileClick(marketIndex, action) {
    const market = gameState.markets[marketIndex];
    const company = gameState.companies[0];

    if (action === 'sell') {
        // 2市場同時販売モードの場合
        if (gameState.twoMarketMode === 'simultaneous') {
            if (!gameState.selectedMarkets) gameState.selectedMarkets = [];

            // 既に選択済みなら除外
            const existingIndex = gameState.selectedMarkets.indexOf(marketIndex);
            if (existingIndex >= 0) {
                gameState.selectedMarkets.splice(existingIndex, 1);
                updateMarketSelectionInstruction();
                renderMarketsBoard();
                return;
            }

            // 選択追加
            gameState.selectedMarkets.push(marketIndex);

            if (gameState.selectedMarkets.length === 2) {
                // 2市場選択完了
                const instruction = document.getElementById('marketInstruction');
                if (instruction) instruction.remove();
                gameState.salesMode = false;
                renderMarketsBoard();
                showTwoMarketSaleModal();
            } else {
                updateMarketSelectionInstruction();
                renderMarketsBoard();
            }
            return;
        }

        // 2市場別々販売モードの場合
        if (gameState.twoMarketMode === 'separate') {
            if (!gameState.selectedMarkets) gameState.selectedMarkets = [];

            // 既に選択済みなら除外
            const existingIndex = gameState.selectedMarkets.indexOf(marketIndex);
            if (existingIndex >= 0) {
                gameState.selectedMarkets.splice(existingIndex, 1);
                updateSeparateMarketSelectionInstruction();
                renderMarketsBoard();
                return;
            }

            // 選択追加
            gameState.selectedMarkets.push(marketIndex);

            if (gameState.selectedMarkets.length === 2) {
                // 2市場選択完了
                const instruction = document.getElementById('marketInstruction');
                if (instruction) instruction.remove();
                gameState.salesMode = false;
                renderMarketsBoard();
                showSeparateTwoMarketSaleModal();
            } else {
                updateSeparateMarketSelectionInstruction();
                renderMarketsBoard();
            }
            return;
        }

        // 通常の1市場販売
        const instruction = document.getElementById('marketInstruction');
        if (instruction) instruction.remove();
        gameState.salesMode = false;
        renderMarketsBoard();
        showSaleConfirmModal(marketIndex);
    } else if (action === 'buy') {
        // 2市場購入モードの場合
        if (gameState.twoMarketBuyMode) {
            if (!gameState.selectedMarkets) gameState.selectedMarkets = [];

            // 既に選択済みなら除外
            const existingIndex = gameState.selectedMarkets.indexOf(marketIndex);
            if (existingIndex >= 0) {
                gameState.selectedMarkets.splice(existingIndex, 1);
                updateTwoMarketBuyInstruction();
                renderMarketsBoard();
                return;
            }

            // 選択追加
            gameState.selectedMarkets.push(marketIndex);

            if (gameState.selectedMarkets.length === 2) {
                // 2市場選択完了
                const instruction = document.getElementById('marketInstruction');
                if (instruction) instruction.remove();
                gameState.buyMode = false;
                renderMarketsBoard();
                showTwoMarketBuyModal();
            } else {
                updateTwoMarketBuyInstruction();
                renderMarketsBoard();
            }
            return;
        }

        // 通常の1市場購入
        const instruction = document.getElementById('marketInstruction');
        if (instruction) instruction.remove();
        gameState.buyMode = false;
        renderMarketsBoard();
        showBuyConfirmModal(marketIndex);
    }
}

// 2市場選択時のインストラクション更新（同時販売）
function updateMarketSelectionInstruction() {
    const instruction = document.getElementById('marketInstruction');
    if (instruction) {
        const selected = gameState.selectedMarkets || [];
        const marketNames = selected.map(i => gameState.markets[i].name).join('、');
        instruction.innerHTML = `
            <span>📍📍 2つの市場を選択 (${selected.length}/2) ${marketNames ? '- ' + marketNames : ''}</span>
            <button class="cancel-mode-btn" onclick="cancelMarketMode()">キャンセル</button>
        `;
    }
}

// 2市場選択時のインストラクション更新（別々販売）
function updateSeparateMarketSelectionInstruction() {
    const instruction = document.getElementById('marketInstruction');
    if (instruction) {
        const selected = gameState.selectedMarkets || [];
        const marketNames = selected.map(i => gameState.markets[i].name).join('、');
        instruction.innerHTML = `
            <span>📍+📍 2つの市場を選択 (${selected.length}/2) ${marketNames ? '- ' + marketNames : ''}</span>
            <button class="cancel-mode-btn" onclick="cancelMarketMode()">キャンセル</button>
        `;
    }
}

// ============================================
// 2市場別々販売
// ============================================

// 2市場別々販売モーダル
function showSeparateTwoMarketSaleModal() {
    const company = gameState.companies[0];
    const salesCapacity = getSalesCapacity(company);
    const market1 = gameState.markets[gameState.selectedMarkets[0]];
    const market2 = gameState.markets[gameState.selectedMarkets[1]];

    // 各市場のマーケットボリューム（空き容量）
    const volume1 = market1.maxStock - market1.currentStock;
    const volume2 = market2.maxStock - market2.currentStock;

    // 各市場への最大販売数
    const maxQty1 = Math.min(salesCapacity, volume1, company.products);
    const maxQty2 = Math.min(salesCapacity, volume2, company.products);

    const defaultPrice1 = market1.sellPrice - 4;
    const defaultPrice2 = market2.sellPrice - 4;

    // 初期値をグローバルに保存
    window.separateMarketData = {
        qty1: 0, qty2: 0,
        price1: defaultPrice1, price2: defaultPrice2,
        max1: maxQty1, max2: maxQty2,
        minPrice1: 26, minPrice2: 26,
        maxPrice1: market1.sellPrice, maxPrice2: market2.sellPrice
    };

    const content = `
        <div style="padding: 8px;">
            <div style="background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%); border-radius: 10px; padding: 10px; margin-bottom: 10px; color: white; text-align: center;">
                <div style="font-weight: bold; font-size: 15px;">2市場別々販売</div>
                <div style="font-size: 11px;">各市場に異なる価格で入札（2行使用）</div>
            </div>

            <div style="background: #f1f5f9; border-radius: 6px; padding: 8px; margin-bottom: 8px; text-align: center;">
                <span style="font-weight: bold; color: #1e293b;">📦${company.products}個 / 販売能力${salesCapacity}</span>
            </div>

            <!-- 1つ目の市場 -->
            <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 10px; padding: 10px; margin-bottom: 8px;">
                <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">🟡 ${market1.name}（¥${market1.sellPrice}上限・空${volume1}個）</div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <div style="flex: 1;">
                        <div style="font-size: 11px; color: #92400e; margin-bottom: 3px;">数量</div>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <button onclick="adjustSeparateQty(1, -1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #d97706; color: white; font-size: 16px; cursor: pointer;">−</button>
                            <div id="separateQty1Display" style="min-width: 40px; padding: 6px; background: white; border-radius: 6px; text-align: center; font-weight: bold;">0</div>
                            <button onclick="adjustSeparateQty(1, 1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #d97706; color: white; font-size: 16px; cursor: pointer;">+</button>
                        </div>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 11px; color: #92400e; margin-bottom: 3px;">価格</div>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <button onclick="adjustSeparatePrice(1, -1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #b45309; color: white; font-size: 16px; cursor: pointer;">−</button>
                            <div id="separatePrice1Display" style="min-width: 50px; padding: 6px; background: white; border-radius: 6px; text-align: center; font-weight: bold;">¥${defaultPrice1}</div>
                            <button onclick="adjustSeparatePrice(1, 1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #b45309; color: white; font-size: 16px; cursor: pointer;">+</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 2つ目の市場 -->
            <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-radius: 10px; padding: 10px; margin-bottom: 8px;">
                <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">🔵 ${market2.name}（¥${market2.sellPrice}上限・空${volume2}個）</div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <div style="flex: 1;">
                        <div style="font-size: 11px; color: #1e40af; margin-bottom: 3px;">数量</div>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <button onclick="adjustSeparateQty(2, -1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #2563eb; color: white; font-size: 16px; cursor: pointer;">−</button>
                            <div id="separateQty2Display" style="min-width: 40px; padding: 6px; background: white; border-radius: 6px; text-align: center; font-weight: bold;">0</div>
                            <button onclick="adjustSeparateQty(2, 1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #2563eb; color: white; font-size: 16px; cursor: pointer;">+</button>
                        </div>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 11px; color: #1e40af; margin-bottom: 3px;">価格</div>
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <button onclick="adjustSeparatePrice(2, -1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #1d4ed8; color: white; font-size: 16px; cursor: pointer;">−</button>
                            <div id="separatePrice2Display" style="min-width: 50px; padding: 6px; background: white; border-radius: 6px; text-align: center; font-weight: bold;">¥${defaultPrice2}</div>
                            <button onclick="adjustSeparatePrice(2, 1)" style="width: 32px; height: 32px; border-radius: 6px; border: none; background: #1d4ed8; color: white; font-size: 16px; cursor: pointer;">+</button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="separateTotalInfo" style="background: #f3f4f6; border-radius: 6px; padding: 8px; margin-bottom: 10px; text-align: center;">
                <span style="color: #6b7280;">合計: <strong id="separateTotalQty">0</strong>個（能力${salesCapacity}）</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <button onclick="cancelSeparateTwoMarketSale()" class="submit-btn" style="background: linear-gradient(180deg, #6b7280 0%, #4b5563 100%); padding: 12px;">
                    ← 戻る
                </button>
                <button onclick="processSeparateTwoMarketSale()" class="submit-btn" style="background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%); padding: 12px;">
                    💰 入札（2行）
                </button>
            </div>
        </div>
    `;

    showModal('📍+📍 2市場別々販売', content);
}

// 別々販売の数量調整
function adjustSeparateQty(marketNum, delta) {
    const data = window.separateMarketData;
    const key = `qty${marketNum}`;
    const maxKey = `max${marketNum}`;
    const newVal = Math.max(0, Math.min(data[key] + delta, data[maxKey]));
    data[key] = newVal;
    document.getElementById(`separateQty${marketNum}Display`).textContent = newVal;
    document.getElementById('separateTotalQty').textContent = data.qty1 + data.qty2;
}

// 別々販売の価格調整
function adjustSeparatePrice(marketNum, delta) {
    const data = window.separateMarketData;
    const key = `price${marketNum}`;
    const minKey = `minPrice${marketNum}`;
    const maxKey = `maxPrice${marketNum}`;
    const newVal = Math.max(data[minKey], Math.min(data[key] + delta, data[maxKey]));
    data[key] = newVal;
    document.getElementById(`separatePrice${marketNum}Display`).textContent = `¥${newVal}`;
}

// 2市場別々販売をキャンセル
function cancelSeparateTwoMarketSale() {
    gameState.selectedMarkets = [];
    gameState.twoMarketMode = false;
    closeModal();
    showSalesTypeModal();
}

// 2市場別々販売を実行
function processSeparateTwoMarketSale() {
    const company = gameState.companies[0];
    const salesCapacity = getSalesCapacity(company);

    // 新しいステッパー形式からデータ取得
    const data = window.separateMarketData || { qty1: 0, qty2: 0, price1: 0, price2: 0 };
    const qty1 = data.qty1;
    const qty2 = data.qty2;
    const price1 = data.price1;
    const price2 = data.price2;

    const totalQty = qty1 + qty2;

    if (totalQty === 0) {
        showToast('少なくとも1つの市場に販売数量を設定してください', 'warning', 3000);
        return;
    }

    if (totalQty > salesCapacity) {
        alert(`合計販売数量（${totalQty}個）が販売能力（${salesCapacity}個）を超えています`);
        return;
    }

    if (totalQty > company.products) {
        alert(`合計販売数量（${totalQty}個）が製品在庫（${company.products}個）を超えています`);
        return;
    }

    const market1 = gameState.markets[gameState.selectedMarkets[0]];
    const market2 = gameState.markets[gameState.selectedMarkets[1]];

    if (qty1 > 0 && price1 > market1.sellPrice) {
        alert(`${market1.name}の入札価格は上限¥${market1.sellPrice}以下にしてください`);
        return;
    }

    if (qty2 > 0 && price2 > market2.sellPrice) {
        alert(`${market2.name}の入札価格は上限¥${market2.sellPrice}以下にしてください`);
        return;
    }

    // 価格競争力を計算
    const competitiveness = getPriceCompetitiveness(company, 0);

    // 2市場別々入札として保存
    gameState.pendingSeparateBids = {
        bids: [],
        currentIndex: 0
    };

    if (qty1 > 0) {
        gameState.pendingSeparateBids.bids.push({
            marketIndex: gameState.selectedMarkets[0],
            quantity: qty1,
            price: price1 - competitiveness,
            displayPrice: price1,
            company: 0
        });
    }

    if (qty2 > 0) {
        gameState.pendingSeparateBids.bids.push({
            marketIndex: gameState.selectedMarkets[1],
            quantity: qty2,
            price: price2 - competitiveness,
            displayPrice: price2,
            company: 0
        });
    }

    closeModal();
    gameState.twoMarketMode = false;
    gameState.selectedMarkets = [];

    // 最初の市場の入札を処理
    processSeparateBidNext();
}

// 別々販売の次の入札を処理
function processSeparateBidNext() {
    const pending = gameState.pendingSeparateBids;

    if (pending.currentIndex >= pending.bids.length) {
        // 全ての入札完了
        gameState.pendingSeparateBids = null;
        updateDisplay();
        return;
    }

    const bid = pending.bids[pending.currentIndex];
    const market = gameState.markets[bid.marketIndex];

    // この入札をpendingBidに設定して通常の入札処理を実行
    gameState.pendingBid = bid;
    gameState.pendingSeparateBids.currentIndex++;

    // 他社の入札を処理
    showOtherPlayersBidModal(market, bid.marketIndex);
}

// ============================================
// 2市場同時販売
// ============================================

// 2市場同時販売モーダル
function showTwoMarketSaleModal() {
    const company = gameState.companies[0];
    const salesCapacity = getSalesCapacity(company);
    const market1 = gameState.markets[gameState.selectedMarkets[0]];
    const market2 = gameState.markets[gameState.selectedMarkets[1]];

    // 低い方の上限価格を適用
    const maxPrice = Math.min(market1.sellPrice, market2.sellPrice);
    const defaultPrice = maxPrice - 4;

    // 各市場のマーケットボリューム（空き容量）
    const volume1 = market1.maxStock - market1.currentStock;
    const volume2 = market2.maxStock - market2.currentStock;
    const totalVolume = volume1 + volume2;

    // 販売上限 = MIN(販売能力, 合計マーケットボリューム, 製品在庫)
    const maxQuantity = Math.min(salesCapacity, totalVolume, company.products);

    // グローバルデータ初期化
    window.twoMarketData = {
        qty: maxQuantity,
        price: defaultPrice,
        maxQty: maxQuantity,
        minPrice: 26,
        maxPrice: maxPrice
    };

    const content = `
        <div style="padding: 8px;">
            <div style="background: linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%); border-radius: 10px; padding: 10px; margin-bottom: 10px; color: white;">
                <div style="font-weight: bold; font-size: 14px; text-align: center; margin-bottom: 8px;">2市場同時販売</div>
                <div style="display: flex; justify-content: space-around; align-items: center;">
                    <div style="text-align: center; flex: 1;">
                        <div style="font-size: 11px; opacity: 0.8;">${market1.name}</div>
                        <div style="font-size: 13px;">¥${market1.sellPrice}</div>
                    </div>
                    <div style="font-size: 18px;">+</div>
                    <div style="text-align: center; flex: 1;">
                        <div style="font-size: 11px; opacity: 0.8;">${market2.name}</div>
                        <div style="font-size: 13px;">¥${market2.sellPrice}</div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3);">
                    <span style="font-size: 11px;">適用上限</span>
                    <span style="font-size: 18px; font-weight: bold; margin-left: 5px;">¥${maxPrice}</span>
                </div>
            </div>

            <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                <div style="flex: 1; background: #f1f5f9; border-radius: 6px; padding: 8px; text-align: center;">
                    <div style="font-size: 10px; color: #64748b;">能力</div>
                    <div style="font-size: 16px; font-weight: bold;">${salesCapacity}</div>
                </div>
                <div style="flex: 1; background: #f1f5f9; border-radius: 6px; padding: 8px; text-align: center;">
                    <div style="font-size: 10px; color: #64748b;">製品</div>
                    <div style="font-size: 16px; font-weight: bold;">${company.products}</div>
                </div>
            </div>

            <!-- 数量ステッパー -->
            <div style="background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%); border-radius: 10px; padding: 10px; margin-bottom: 8px;">
                <div style="font-size: 12px; color: #6d28d9; margin-bottom: 6px; text-align: center;">📦 販売数量</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button onclick="adjustTwoMarketQty(-1)" style="width: 40px; height: 40px; border-radius: 8px; border: none; background: #7c3aed; color: white; font-size: 20px; cursor: pointer;">−</button>
                    <div id="twoMarketQtyDisplay" style="min-width: 60px; padding: 10px; background: white; border-radius: 8px; text-align: center; font-size: 20px; font-weight: bold;">${maxQuantity}</div>
                    <button onclick="adjustTwoMarketQty(1)" style="width: 40px; height: 40px; border-radius: 8px; border: none; background: #7c3aed; color: white; font-size: 20px; cursor: pointer;">+</button>
                </div>
            </div>

            <!-- 価格ステッパー -->
            <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 10px; padding: 10px; margin-bottom: 10px;">
                <div style="font-size: 12px; color: #92400e; margin-bottom: 6px; text-align: center;">💵 入札価格</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <button onclick="adjustTwoMarketPrice(-5)" style="width: 36px; height: 36px; border-radius: 6px; border: none; background: #d97706; color: white; font-size: 12px; cursor: pointer;">-5</button>
                    <button onclick="adjustTwoMarketPrice(-1)" style="width: 32px; height: 36px; border-radius: 6px; border: none; background: #f59e0b; color: white; font-size: 16px; cursor: pointer;">−</button>
                    <div id="twoMarketPriceDisplay" style="min-width: 70px; padding: 8px; background: white; border-radius: 8px; text-align: center; font-size: 18px; font-weight: bold;">¥${defaultPrice}</div>
                    <button onclick="adjustTwoMarketPrice(1)" style="width: 32px; height: 36px; border-radius: 6px; border: none; background: #f59e0b; color: white; font-size: 16px; cursor: pointer;">+</button>
                    <button onclick="adjustTwoMarketPrice(5)" style="width: 36px; height: 36px; border-radius: 6px; border: none; background: #d97706; color: white; font-size: 12px; cursor: pointer;">+5</button>
                </div>
                <div style="font-size: 10px; color: #92400e; text-align: center; margin-top: 4px;">¥26～¥${maxPrice}</div>
            </div>

            <div style="font-size: 11px; color: #6b7280; margin-bottom: 10px; text-align: center;">
                ※ 両市場に同価格で入札（1行使用）
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <button onclick="cancelTwoMarketSale()" class="submit-btn" style="background: linear-gradient(180deg, #6b7280 0%, #4b5563 100%); padding: 12px;">
                    ← 戻る
                </button>
                <button onclick="processTwoMarketSale()" class="submit-btn" style="padding: 12px;">
                    💰 入札実行
                </button>
            </div>
        </div>
    `;

    showModal('📍📍 2市場同時販売', content);
}

// 2市場同時販売の数量調整
function adjustTwoMarketQty(delta) {
    const data = window.twoMarketData;
    data.qty = Math.max(1, Math.min(data.qty + delta, data.maxQty));
    document.getElementById('twoMarketQtyDisplay').textContent = data.qty;
}

// 2市場同時販売の価格調整
function adjustTwoMarketPrice(delta) {
    const data = window.twoMarketData;
    data.price = Math.max(data.minPrice, Math.min(data.price + delta, data.maxPrice));
    document.getElementById('twoMarketPriceDisplay').textContent = `¥${data.price}`;
}

// 2市場同時販売をキャンセル
function cancelTwoMarketSale() {
    gameState.selectedMarkets = [];
    gameState.twoMarketMode = false;
    closeModal();
    showSalesTypeModal();
}

// 2市場同時販売を実行
function processTwoMarketSale() {
    const company = gameState.companies[0];
    const data = window.twoMarketData || { qty: 1, price: 26 };
    const quantity = data.qty;
    const bidPrice = data.price;
    const salesCapacity = getSalesCapacity(company);

    if (quantity > salesCapacity) {
        alert(`販売能力（${salesCapacity}個）を超えて入札できません`);
        return;
    }

    const market1 = gameState.markets[gameState.selectedMarkets[0]];
    const market2 = gameState.markets[gameState.selectedMarkets[1]];
    const maxPrice = Math.min(market1.sellPrice, market2.sellPrice);

    if (bidPrice > maxPrice) {
        alert(`入札価格は上限価格¥${maxPrice}以下にしてください`);
        return;
    }

    // 価格競争力を計算
    const competitiveness = getPriceCompetitiveness(company, 0);
    const effectiveBidPrice = bidPrice - competitiveness;

    // 2市場同時入札として保存
    gameState.pendingBid = {
        markets: gameState.selectedMarkets,
        quantity: quantity,
        price: effectiveBidPrice,
        displayPrice: bidPrice,
        company: 0,
        isTwoMarket: true
    };

    closeModal();

    // 他社の入札を処理
    showOtherPlayersBidModalTwoMarket();
}

// ============================================
// 販売確認モーダル
// ============================================

// 販売確認モーダル
function showSaleConfirmModal(marketIndex) {
    const market = gameState.markets[marketIndex];
    const company = gameState.companies[0];
    const salesCapacity = getSalesCapacity(company);
    // 海外のみ上限なし、東京含む他市場は市場容量制限あり
    const isOverseas = market.name === '海外';
    const marketLimit = isOverseas ? Infinity : (market.maxStock - market.currentStock);
    const maxQuantity = Math.min(salesCapacity, company.products, marketLimit);
    const defaultPrice = market.sellPrice - 4;

    const content = `
        <div style="background: linear-gradient(180deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 2px solid #f59e0b;">
            <div style="display: flex; justify-content: space-around; text-align: center;">
                <div>
                    <div style="font-size: 12px; color: #92400e;">選択市場</div>
                    <div style="font-size: 20px; font-weight: bold; color: #78350f;">${market.name}</div>
                </div>
                <div>
                    <div style="font-size: 12px; color: #92400e;">上限価格</div>
                    <div style="font-size: 20px; font-weight: bold; color: #059669;">¥${market.sellPrice}</div>
                </div>
                <div>
                    <div style="font-size: 12px; color: #92400e;">${market.needsBid ? '入札' : '即売'}</div>
                    <div style="font-size: 20px; font-weight: bold; color: ${market.needsBid ? '#dc2626' : '#2563eb'};">${market.needsBid ? '⚔️' : '✓'}</div>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
            <div style="background: #f1f5f9; border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 11px; color: #64748b;">販売能力</div>
                <div style="font-size: 22px; font-weight: bold; color: #1e293b;">${salesCapacity}</div>
            </div>
            <div style="background: #f1f5f9; border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 11px; color: #64748b;">製品在庫</div>
                <div style="font-size: 22px; font-weight: bold; color: #1e293b;">${company.products}</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr ${market.needsBid ? '1fr' : ''}; gap: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="text-align: center;">📦 販売数量</label>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button type="button" onclick="adjustStepper('quantity', -1, 1, ${maxQuantity})" class="stepper-btn" style="width: 44px; height: 44px; border-radius: 50%; border: none; background: #2563eb; color: white; font-size: 22px; font-weight: bold; cursor: pointer;">−</button>
                    <input type="number" id="quantity" value="${maxQuantity > 0 ? maxQuantity : 0}" min="${maxQuantity > 0 ? 1 : 0}" max="${maxQuantity}" readonly style="width: 65px; height: 44px; border-radius: 8px; border: 2px solid #2563eb; font-size: 24px; font-weight: bold; text-align: center; background: white; color: #1e40af;">
                    <button type="button" onclick="adjustStepper('quantity', 1, 1, ${maxQuantity})" class="stepper-btn" style="width: 44px; height: 44px; border-radius: 50%; border: none; background: #2563eb; color: white; font-size: 22px; font-weight: bold; cursor: pointer;">+</button>
                </div>
            </div>
            ${market.needsBid ? `
            <div class="form-group" style="margin-bottom: 0;" id="bidPriceGroup">
                <label class="form-label" style="text-align: center;">💵 入札価格</label>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <button type="button" onclick="adjustStepper('bidPrice', -1, 1, ${market.sellPrice})" class="stepper-btn" style="width: 44px; height: 44px; border-radius: 50%; border: none; background: #059669; color: white; font-size: 22px; font-weight: bold; cursor: pointer;">−</button>
                    <input type="number" id="bidPrice" value="${defaultPrice}" min="1" max="${market.sellPrice}" readonly style="width: 65px; height: 44px; border-radius: 8px; border: 2px solid #059669; font-size: 24px; font-weight: bold; text-align: center; background: white; color: #047857;">
                    <button type="button" onclick="adjustStepper('bidPrice', 1, 1, ${market.sellPrice})" class="stepper-btn" style="width: 44px; height: 44px; border-radius: 50%; border: none; background: #059669; color: white; font-size: 22px; font-weight: bold; cursor: pointer;">+</button>
                </div>
            </div>
            ` : ''}
        </div>

        <input type="hidden" id="marketSelect" value="${marketIndex}">

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">
            <button class="submit-btn" onclick="enterSalesMode()" style="background: linear-gradient(180deg, #6b7280 0%, #4b5563 100%);">
                ← 市場を変更
            </button>
            <button class="submit-btn" onclick="processSale()" ${maxQuantity <= 0 ? 'disabled' : ''}>
                💰 販売実行
            </button>
        </div>
    `;

    showModal(`💰 ${market.name}に販売`, content);
}

// ============================================
// 購入確認モーダル
// ============================================

// 購入確認モーダル
function showBuyConfirmModal(marketIndex) {
    const market = gameState.markets[marketIndex];
    const company = gameState.companies[0];
    const maxQuantity = Math.min(market.currentStock, Math.floor(company.cash / market.buyPrice));

    // 材料倉庫の空き容量をチェック
    const maxMaterialCapacity = getMaterialCapacity(company);
    const spaceAvailable = maxMaterialCapacity - company.materials;
    const actualMax = Math.min(maxQuantity, spaceAvailable);

    const content = `
        <div style="background: linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 2px solid #22c55e;">
            <div style="display: flex; justify-content: space-around; text-align: center;">
                <div>
                    <div style="font-size: 12px; color: #166534;">選択市場</div>
                    <div style="font-size: 20px; font-weight: bold; color: #14532d;">${market.name}</div>
                </div>
                <div>
                    <div style="font-size: 12px; color: #166534;">仕入価格</div>
                    <div style="font-size: 20px; font-weight: bold; color: #059669;">¥${market.buyPrice}</div>
                </div>
                <div>
                    <div style="font-size: 12px; color: #166534;">市場在庫</div>
                    <div style="font-size: 20px; font-weight: bold; color: #14532d;">${market.currentStock}個</div>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
            <div style="background: #f1f5f9; border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 11px; color: #64748b;">現金</div>
                <div style="font-size: 22px; font-weight: bold; color: #1e293b;">¥${company.cash}</div>
            </div>
            <div style="background: #f1f5f9; border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 11px; color: #64748b;">材料在庫</div>
                <div style="font-size: 22px; font-weight: bold; color: #1e293b;">${company.materials}個</div>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label" style="text-align: center;">📦 購入数量</label>
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <button type="button" onclick="adjustBuyStepper(-1, ${actualMax}, ${market.buyPrice})" class="stepper-btn" style="width: 44px; height: 44px; border-radius: 50%; border: none; background: #22c55e; color: white; font-size: 22px; font-weight: bold; cursor: pointer;">−</button>
                <input type="number" id="buyQuantity" value="${actualMax > 0 ? Math.min(actualMax, 3) : 0}" min="${actualMax > 0 ? 1 : 0}" max="${actualMax}" readonly style="width: 65px; height: 44px; border-radius: 8px; border: 2px solid #22c55e; font-size: 24px; font-weight: bold; text-align: center; background: white; color: #166534;">
                <button type="button" onclick="adjustBuyStepper(1, ${actualMax}, ${market.buyPrice})" class="stepper-btn" style="width: 44px; height: 44px; border-radius: 50%; border: none; background: #22c55e; color: white; font-size: 22px; font-weight: bold; cursor: pointer;">+</button>
            </div>
            <div id="buyCostDisplay" style="text-align: center; margin-top: 8px; font-size: 16px; color: #059669; font-weight: bold;">
                合計: ¥${Math.min(actualMax, 3) * market.buyPrice}
            </div>
        </div>

        <input type="hidden" id="buyMarketSelect" value="${marketIndex}">

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px;">
            <button class="submit-btn" onclick="enterBuyMode()" style="background: linear-gradient(180deg, #6b7280 0%, #4b5563 100%);">
                ← 市場を変更
            </button>
            <button class="submit-btn" onclick="processBuyFromModal()" ${actualMax <= 0 ? 'disabled' : ''} style="background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);">
                📦 購入実行
            </button>
        </div>
    `;

    showModal(`📦 ${market.name}から材料購入`, content);
}

// モーダルから購入処理
function processBuyFromModal() {
    const marketIndex = parseInt(document.getElementById('buyMarketSelect').value);
    const quantity = parseInt(document.getElementById('buyQuantity').value);
    const market = gameState.markets[marketIndex];
    const company = gameState.companies[0];

    const cost = market.buyPrice * quantity;

    if (company.cash < cost) {
        showToast('現金が不足しています', 'danger', 3000);
        return;
    }

    if (market.currentStock < quantity) {
        showToast('市場在庫が不足しています', 'danger', 3000);
        return;
    }

    company.cash -= cost;
    company.materials += quantity;
    market.currentStock -= quantity;
    company.totalMaterialCost = (company.totalMaterialCost || 0) + cost;

    closeModal();
    updateDisplay();
    showToast(`${market.name}から材料${quantity}個を¥${cost}で購入しました`, 'success', 3000);
    endTurn();
}

// ============================================
// 販売処理
// ============================================

// 販売モードに入るように変更
function showSalesModal() {
    enterSalesMode();
}

// Process sale
function processSale() {
    const company = gameState.companies[0];
    const marketIndex = parseInt(document.getElementById('marketSelect').value);
    const quantity = parseInt(document.getElementById('quantity').value);
    const market = gameState.markets[marketIndex];

    if (company.products < quantity) {
        showToast('製品が不足しています！', 'danger', 3000);
        return;
    }

    if (market.needsBid) {
        // 入札処理
        const bidPrice = parseInt(document.getElementById('bidPrice').value);

        // プレイヤーの入札（販売能力を超えて入札できない）
        const salesCapacity = getSalesCapacity(company);
        if (quantity > salesCapacity) {
            alert(`販売能力（${salesCapacity}個）を超えて入札できません`);
            return;
        }

        // Store bid for later processing
        // 価格競争力を計算（親ボーナス+研究チップ）
        const competitiveness = getPriceCompetitiveness(company, 0);  // 0はプレイヤーのindex
        const effectiveBidPrice = bidPrice - competitiveness;

        // デバッグ情報
        console.log(`プレイヤー入札: 表示価格=${bidPrice}, 競争力=${competitiveness}, 有効価格=${effectiveBidPrice}`);

        gameState.pendingBid = {
            market: marketIndex,
            company: 0,
            price: effectiveBidPrice,  // 有効入札価格
            quantity: quantity,
            displayPrice: bidPrice  // 表示用価格
        };

        // Show modal for other players to bid
        showOtherPlayersBidModal(market, marketIndex);
        return;  // Exit here, will continue after all bids collected
    } else {
        // 入札不要（東京・海外）
        const isOverseas = market.name === '海外';
        // 海外は無制限、東京は市場容量制限あり
        const actualQty = isOverseas ? quantity : Math.min(quantity, market.maxStock - market.currentStock);

        if (actualQty > 0) {
            company.cash += market.sellPrice * actualQty;
            company.products -= actualQty;
            company.totalSales += market.sellPrice * actualQty;
            company.totalSoldQuantity = (company.totalSoldQuantity || 0) + actualQty;
            // 海外以外は市場在庫を増やす（販売枠の消費）
            if (!isOverseas) {
                market.currentStock += actualQty;
            }

            closeModal();
            updateDisplay();
            alert(`${market.name}に製品${actualQty}個を¥${market.sellPrice * actualQty}で販売しました`);
            endTurn();
        } else {
            alert('この市場はこれ以上販売できません');
        }
    }
}

// Complete sale
function completeSale() {
    closeModal();
    updateDisplay();
    if (gameState.lastSaleInfo) {
        alert(gameState.lastSaleInfo);
        gameState.lastSaleInfo = null;
    }

    // 別々販売の次の入札があれば処理
    if (gameState.pendingSeparateBids && gameState.pendingSeparateBids.currentIndex < gameState.pendingSeparateBids.bids.length) {
        processSeparateBidNext();
        return;
    }

    // 別々販売完了
    if (gameState.pendingSeparateBids) {
        gameState.pendingSeparateBids = null;
    }

    // プレイヤーが実際に販売した場合のみ1行使用（お金の流れがあった場合）
    const playerSold = gameState.playerSoldInBid;
    gameState.playerSoldInBid = null;  // フラグをリセット

    if (playerSold) {
        endTurn();
    } else {
        nextTurn();
    }
}
