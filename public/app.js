const menuList = document.querySelector("#menu-list");
const cartLines = document.querySelector("#cart-lines");
const cartTotal = document.querySelector("#cart-total");
const checkoutButton = document.querySelector("#checkout-button");
const paymentCard = document.querySelector("#payment-card");
const customerName = document.querySelector("#customer-name");
const showCardForm = document.querySelector("#show-card-form");
const cardForm = document.querySelector("#card-form");
const newCardName = document.querySelector("#new-card-name");
const newCardNumber = document.querySelector("#new-card-number");
const message = document.querySelector("#message");
const serviceStatus = document.querySelector("#service-status");
const invoiceLinkPanel = document.querySelector("#invoice-link-panel");
const invoiceLink = document.querySelector("#invoice-link");
const invoicePreview = document.querySelector("#invoice-preview");
const invoiceTransactionId = document.querySelector("#invoice-transaction-id");
const invoiceOrderId = document.querySelector("#invoice-order-id");
const invoicePaidVia = document.querySelector("#invoice-paid-via");
const invoiceCardLast4 = document.querySelector("#invoice-card-last4");
const invoiceCustomerName = document.querySelector("#invoice-customer-name");
const gatewayOrigin = "http://127.0.0.1:4174";

const state = {
  menu: [],
  cart: new Map(),
  lastInvoice: null,
  cards: [
    {
      id: "approved-card",
      maskedNumber: "xxxx-xxxx-xxxx-6781",
      label: "xxxx-xxxx-xxxx-6781 (Approved)",
      outcome: "approved",
      cardholder: "FoodHub Demo User"
    },
    {
      id: "declined-card",
      maskedNumber: "xxxx-xxxx-xxxx-8911",
      label: "xxxx-xxxx-xxxx-8911 (Declined)",
      outcome: "declined",
      cardholder: "FoodHub Demo User"
    }
  ]
};

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

async function loadMenu() {
  loadSavedCards();
  await completeReturnedPayment();
  const response = await fetch("/menu");
  const payload = await response.json();
  state.menu = payload.items;
  serviceStatus.textContent = "Service online";
  renderCards();
  renderMenu();
  renderCart();
}

function renderMenu() {
  menuList.innerHTML = "";

  for (const item of state.menu) {
    const row = document.createElement("article");
    row.className = "menu-item";
    row.innerHTML = `
      <div>
        <h3>${item.name}</h3>
        <p>${item.description}</p>
      </div>
      <div class="item-actions">
        <span class="price">${money(item.price)}</span>
        <button type="button" data-add="${item.id}">Add</button>
      </div>
    `;
    menuList.append(row);
  }
}

function renderCart() {
  cartLines.innerHTML = "";

  if (!state.cart.size) {
    cartLines.textContent = "No items added yet.";
  } else {
    for (const [id, quantity] of state.cart) {
      const item = state.menu.find((menuItem) => menuItem.id === id);
      const line = document.createElement("div");
      line.className = "cart-line";
      line.innerHTML = `<span>${quantity} x ${item.name}</span><strong>${money(item.price * quantity)}</strong>`;
      cartLines.append(line);
    }
  }

  cartTotal.textContent = money(calculateTotal());
  checkoutButton.disabled = !state.cart.size;
}

function loadSavedCards() {
  const savedCards = JSON.parse(localStorage.getItem("foodhubCards") ?? "[]");
  state.cards.push(...savedCards);
}

function renderCards() {
  paymentCard.innerHTML = "";

  for (const card of state.cards) {
    const option = document.createElement("option");
    option.value = card.id;
    option.textContent = card.label;
    paymentCard.append(option);
  }

  syncCustomerNameFromCard();
}

function selectedCard() {
  return state.cards.find((card) => card.id === paymentCard.value);
}

function syncCustomerNameFromCard() {
  const card = selectedCard();
  if (card && !customerName.value.trim()) {
    customerName.value = card.cardholder;
  }
}

function calculateTotal() {
  let total = 0;

  for (const [id, quantity] of state.cart) {
    const item = state.menu.find((menuItem) => menuItem.id === id);
    total += item.price * quantity;
  }

  return total;
}

menuList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;

  const id = button.dataset.add;
  state.cart.set(id, (state.cart.get(id) ?? 0) + 1);
  message.textContent = "";
  message.className = "message";
  invoiceLinkPanel.hidden = true;
  invoicePreview.hidden = true;
  renderCart();
});

checkoutButton.addEventListener("click", async () => {
  const card = selectedCard();
  if (!card) return;

  const trimmedCustomerName = customerName.value.trim();
  if (!trimmedCustomerName) {
    message.textContent = "Enter the customer name before placing the order.";
    message.className = "message error";
    customerName.focus();
    return;
  }

  const pendingOrder = {
    items: [...state.cart].map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
    cardId: card.id,
    customerName: trimmedCustomerName,
    maskedNumber: card.maskedNumber,
    paidVia: "FoodHub Payment Gateway"
  };

  sessionStorage.setItem("foodhubPendingOrder", JSON.stringify(pendingOrder));
  message.textContent = "Launching FoodHub Payment Gateway...";
  message.className = "message";

  const params = new URLSearchParams({
    amount: calculateTotal().toFixed(2),
    cardId: card.id,
    maskedNumber: card.maskedNumber,
    outcome: card.outcome,
    cardholder: card.cardholder,
    returnUrl: `${window.location.origin}/`
  });

  window.location.href = `${gatewayOrigin}/?${params.toString()}`;
});

showCardForm.addEventListener("click", () => {
  cardForm.hidden = !cardForm.hidden;
});

cardForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const digits = newCardNumber.value.replace(/\D/g, "");
  const name = newCardName.value.trim();

  if (digits.length < 12 || !name) {
    message.textContent = "Enter a fake card user name and at least 12 card digits.";
    message.className = "message error";
    return;
  }

  const lastFour = digits.slice(-4);
  const customCard = {
    id: `custom-${Date.now()}`,
    maskedNumber: `xxxx-xxxx-xxxx-${lastFour}`,
    label: `xxxx-xxxx-xxxx-${lastFour} (Fake Payment Card)`,
    outcome: "approved",
    cardholder: name
  };

  const savedCards = JSON.parse(localStorage.getItem("foodhubCards") ?? "[]");
  savedCards.push(customCard);
  localStorage.setItem("foodhubCards", JSON.stringify(savedCards));
  state.cards.push(customCard);
  renderCards();
  paymentCard.value = customCard.id;
  customerName.value = name;
  cardForm.reset();
  cardForm.hidden = true;
  message.textContent = "Fake payment card added.";
  message.className = "message success";
});

async function completeReturnedPayment() {
  const params = new URLSearchParams(window.location.search);
  const gatewayStatus = params.get("gatewayStatus");
  const paymentId = params.get("paymentId");

  if (!gatewayStatus) return;

  window.history.replaceState({}, "", "/");

  const pendingOrder = JSON.parse(sessionStorage.getItem("foodhubPendingOrder") ?? "null");
  sessionStorage.removeItem("foodhubPendingOrder");

  if (!pendingOrder) {
    message.textContent = "No pending order found after returning from payment.";
    message.className = "message error";
    return;
  }

  if (gatewayStatus !== "paid" || !paymentId) {
    message.textContent = "FoodHub Payment Gateway declined this card.";
    message.className = "message error";
    return;
  }

  message.textContent = "Payment approved. Creating order...";
  message.className = "message";

  const response = await fetch("/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentToken: `gateway_paid_${paymentId}`,
      cardId: pendingOrder.cardId,
      customerName: pendingOrder.customerName,
      items: pendingOrder.items
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    message.textContent = `${payload.error}: ${payload.details}`;
    message.className = "message error";
    checkoutButton.disabled = false;
    return;
  }

  const invoice = {
    transactionId: payload.paymentId,
    orderId: payload.orderId,
    paidVia: pendingOrder.paidVia,
    cardLast4: pendingOrder.maskedNumber.slice(-4),
    customerName: payload.customerName ?? pendingOrder.customerName
  };

  state.lastInvoice = invoice;
  renderInvoiceLink(invoice);
  message.textContent = `Order ${payload.orderId} paid ${money(payload.total)} for ${invoice.customerName}.`;
  message.className = "message success";
  state.cart.clear();
}

paymentCard.addEventListener("change", () => {
  const card = selectedCard();
  if (card) {
    customerName.value = card.cardholder;
  }
});

invoiceLink.addEventListener("click", (event) => {
  event.preventDefault();
  if (!state.lastInvoice) return;

  invoiceTransactionId.textContent = state.lastInvoice.transactionId;
  invoiceOrderId.textContent = state.lastInvoice.orderId;
  invoicePaidVia.textContent = state.lastInvoice.paidVia;
  invoiceCardLast4.textContent = state.lastInvoice.cardLast4;
  invoiceCustomerName.textContent = state.lastInvoice.customerName;
  invoicePreview.hidden = false;
  invoicePreview.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

function renderInvoiceLink(invoice) {
  invoiceLink.textContent = `Open invoice for order ${invoice.orderId}`;
  invoiceLinkPanel.hidden = false;
  invoicePreview.hidden = true;
}

loadMenu().catch(() => {
  serviceStatus.textContent = "Service unavailable";
  message.textContent = "Could not load the menu.";
  message.className = "message error";
});
