(() => {
  'use strict';

  const API = window.APP_CONFIG.API_BASE;
  const CART_KEY = 'jeju-market-cart-id';
  const won = n => n.toLocaleString('ko-KR') + '원';
  const $ = id => document.getElementById(id);

  // ---------- 익명 장바구니 ID (브라우저마다 1개, 서버는 UUID v4만 받음) ----------
  function getCartId() {
    let id = null;
    try { id = localStorage.getItem(CART_KEY); } catch { /* private mode */ }
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      id = crypto.randomUUID();
      try { localStorage.setItem(CART_KEY, id); } catch { /* ignore */ }
    }
    return id;
  }
  const cartId = getCartId();

  // ---------- API 호출 ----------
  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(API + path, {
      method,
      headers: {
        'X-Cart-Id': cartId,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const msg = typeof data?.detail === 'string' ? data.detail : '요청을 처리하지 못했습니다.';
      throw new Error(msg);
    }
    return data;
  }

  // ---------- DOM 헬퍼 (innerHTML 대신 textContent → XSS 방지) ----------
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'tone') el.style.setProperty('--tone', /^#[0-9a-f]{6}$/i.test(v) ? v : '#f97316');
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) el.append(c);
    return el;
  }

  // ---------- 토스트 ----------
  let toastTimer;
  function toast(msg, isError = false) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('error', isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ---------- 상태 ----------
  let products = [];
  let category = '전체';
  let cart = { items: [], item_count: 0, subtotal: 0, shipping: 0, total: 0, free_shipping_min: 30000 };

  // ---------- 서버 상태 ----------
  async function checkHealth() {
    const pill = $('apiPill');
    try {
      await api('/health');
      pill.className = 'api-pill ok';
      pill.lastElementChild.textContent = '서버 연결됨';
    } catch {
      pill.className = 'api-pill err';
      pill.lastElementChild.textContent = '서버 연결 실패';
    }
  }

  // ---------- 상품 ----------
  function renderSkeleton() {
    $('grid').replaceChildren(...Array.from({ length: 8 }, () => h('div', { class: 'skeleton' })));
  }

  function renderChips() {
    const cats = ['전체', ...new Set(products.map(p => p.category))];
    $('chips').replaceChildren(...cats.map(c =>
      h('button', {
        class: 'chip' + (c === category ? ' active' : ''),
        role: 'tab',
        'aria-selected': String(c === category),
        text: c,
        onclick: () => { category = c; renderChips(); renderProducts(); },
      })
    ));
  }

  function renderProducts() {
    const list = category === '전체' ? products : products.filter(p => p.category === category);
    if (!list.length) {
      $('grid').replaceChildren(h('div', { class: 'state' }, h('b', { text: '🧺' }), '상품이 없습니다.'));
      return;
    }
    $('grid').replaceChildren(...list.map(p => {
      const soldOut = p.stock < 1;
      const btn = h('button', {
        class: 'add-btn',
        disabled: soldOut,
        text: soldOut ? '품절' : '담기',
        onclick: () => addToCart(p, btn),
      });
      return h('article', { class: 'product' },
        h('div', { class: 'product-art', tone: p.color },
          h('span', { text: p.emoji }),
          h('em', { class: 'tag', text: p.category }),
          p.stock > 0 && p.stock <= 40 ? h('em', { class: 'tag low', text: `${p.stock}개 남음` }) : null,
        ),
        h('div', { class: 'product-body' },
          h('h3', { text: p.name }),
          h('p', { text: p.description }),
          h('div', { class: 'product-foot' },
            h('span', { class: 'price' }, p.price.toLocaleString('ko-KR'), h('small', { text: '원' })),
            btn,
          ),
        ),
      );
    }));
  }

  async function loadProducts() {
    renderSkeleton();
    try {
      products = await api('/api/products');
      renderChips();
      renderProducts();
    } catch (e) {
      $('grid').replaceChildren(
        h('div', { class: 'state' }, h('b', { text: '🛠️' }), `상품을 불러오지 못했습니다. (${e.message})`)
      );
    }
  }

  // ---------- 장바구니 ----------
  function setCart(next) {
    const before = cart.item_count;
    cart = next;
    renderCart();
    if (cart.item_count !== before) {
      const badge = $('cartCount');
      badge.classList.remove('bump');
      void badge.offsetWidth;
      badge.classList.add('bump');
    }
  }

  function renderCart() {
    $('cartCount').textContent = cart.item_count;
    $('drawerCount').textContent = cart.item_count ? `(${cart.item_count})` : '';

    const min = cart.free_shipping_min;
    const left = Math.max(min - cart.subtotal, 0);
    $('shipText').replaceChildren(
      ...(cart.subtotal === 0
        ? [`${won(min)} 이상 담으면 `, h('b', { text: '무료배송' })]
        : left > 0
          ? [h('b', { text: won(left) }), ' 더 담으면 무료배송이에요']
          : ['🎉 ', h('b', { text: '무료배송' }), ' 조건을 채웠어요!'])
    );
    const fill = $('shipFill');
    fill.style.width = Math.min(cart.subtotal / min * 100, 100) + '%';
    fill.classList.toggle('full', left === 0 && cart.subtotal > 0);

    const list = $('cartList');
    if (!cart.items.length) {
      list.replaceChildren(h('li', { class: 'cart-empty' }, h('b', { text: '🧺' }), '장바구니가 비어 있어요'));
    } else {
      list.replaceChildren(...cart.items.map(({ product: p, quantity: q, line_total }) =>
        h('li', { class: 'cart-item' },
          h('div', { class: 'cart-thumb', tone: p.color, text: p.emoji }),
          h('div', { class: 'cart-info' },
            h('h4', { text: p.name }),
            h('div', { class: 'unit', text: won(p.price) }),
            h('div', { class: 'stepper' },
              h('button', { 'aria-label': '수량 빼기', disabled: q <= 1, text: '−', onclick: () => changeQty(p.id, q - 1) }),
              h('span', { text: String(q) }),
              h('button', { 'aria-label': '수량 더하기', disabled: q >= Math.min(99, p.stock), text: '+', onclick: () => changeQty(p.id, q + 1) }),
            ),
          ),
          h('div', { class: 'cart-right' },
            h('b', { text: won(line_total) }),
            h('button', { class: 'remove', text: '삭제', onclick: () => removeItem(p.id) }),
          ),
        )
      ));
    }

    $('sumSub').textContent = won(cart.subtotal);
    $('sumShip').textContent = cart.subtotal === 0 ? '0원' : cart.shipping ? won(cart.shipping) : '무료';
    $('sumTotal').textContent = won(cart.total);
    $('checkoutBtn').disabled = !cart.items.length;
    $('clearBtn').hidden = !cart.items.length;
  }

  async function withBusy(fn) {
    const drawer = $('drawer');
    drawer.classList.add('busy');
    try { await fn(); } catch (e) { toast(e.message, true); } finally { drawer.classList.remove('busy'); }
  }

  async function loadCart() {
    try { setCart(await api('/api/cart')); } catch (e) { toast('장바구니를 불러오지 못했습니다.', true); }
  }

  async function addToCart(p, btn) {
    btn.disabled = true;
    try {
      setCart(await api('/api/cart/items', { method: 'POST', body: { product_id: p.id, quantity: 1 } }));
      btn.classList.add('added');
      btn.textContent = '✓ 담김';
      toast(`${p.emoji} ${p.name}을(를) 담았어요`);
      setTimeout(() => { btn.classList.remove('added'); btn.textContent = '담기'; btn.disabled = false; }, 1100);
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false;
    }
  }

  const changeQty = (id, q) => withBusy(async () =>
    setCart(await api(`/api/cart/items/${id}`, { method: 'PATCH', body: { quantity: q } })));

  const removeItem = id => withBusy(async () =>
    setCart(await api(`/api/cart/items/${id}`, { method: 'DELETE' })));

  $('clearBtn').addEventListener('click', () => {
    if (!confirm('장바구니를 모두 비울까요?')) return;
    withBusy(async () => setCart(await api('/api/cart', { method: 'DELETE' })));
  });

  $('checkoutBtn').addEventListener('click', () => withBusy(async () => {
    const order = await api('/api/checkout', { method: 'POST' });
    closeDrawer();
    $('orderText').textContent =
      `주문번호 #${order.order_id} · 상품 ${order.item_count}개 · 총 ${won(order.total)}`;
    $('orderModal').hidden = false;
    await Promise.all([loadCart(), loadProducts()]);
  }));

  $('orderClose').addEventListener('click', () => { $('orderModal').hidden = true; });

  // ---------- 드로어 열고 닫기 ----------
  function openDrawer() {
    $('overlay').hidden = false;
    requestAnimationFrame(() => $('overlay').classList.add('show'));
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    document.body.classList.add('lock');
    loadCart();
  }
  function closeDrawer() {
    $('overlay').classList.remove('show');
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lock');
    setTimeout(() => { $('overlay').hidden = true; }, 250);
  }
  $('cartOpen').addEventListener('click', openDrawer);
  $('cartClose').addEventListener('click', closeDrawer);
  $('overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!$('orderModal').hidden) $('orderModal').hidden = true;
    else closeDrawer();
  });

  // ---------- 시작 ----------
  checkHealth();
  loadProducts();
  loadCart();
})();
