const menuList = document.querySelector("#menu-list");
const cartLines = document.querySelector("#cart-lines");
const cartTotal = document.querySelector("#cart-total");
const checkoutButton = document.querySelector("#checkout-button");
const paymentCard = document.querySelector("#payment-card");
const showCardForm = document.querySelector("#show-card-form");
const cardForm = document.querySelector("#card-form");
const newCardName = document.querySelector("#new-card-name");
const newCardNumber = document.querySelector("#new-card-number");
const message = document.querySelector("#message");
const serviceStatus = document.querySelector("#service-status");
const gatewayOrigin = "http://127.0.0.1:4174";

const state = {
  menu: [],
  cart: new Map(),
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
}

function selectedCard() {
  return state.cards.find((card) => card.id === paymentCard.value);
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
  renderCart();
});

checkoutButton.addEventListener("click", async () => {
  const card = selectedCard();
  if (!card) return;

  const pendingOrder = {
    items: [...state.cart].map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
    cardId: card.id
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

  message.textContent = `Order ${payload.orderId} paid ${money(payload.total)}. ${payload.aiSuggestion}`;
  message.className = "message success";
  state.cart.clear();
}

loadMenu().catch(() => {
  serviceStatus.textContent = "Service unavailable";
  message.textContent = "Could not load the menu.";
  message.className = "message error";
});
