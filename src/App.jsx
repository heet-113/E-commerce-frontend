import { useEffect, useMemo, useState } from 'react';

const API_ROOT = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

const defaultShipping = {
  fullName: '',
  email: '',
  address: '',
  city: '',
  country: '',
  postalCode: '',
};

const defaultProduct = {
  name: '',
  description: '',
  category: 'General',
  price: '',
  stock: '',
  accent: '#2563eb',
  featured: false,
};

const defaultAuthForm = {
  name: '',
  email: '',
  password: '',
};

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function readStoredSession() {
  if (typeof window === 'undefined') {
    return { token: '', user: null };
  }

  try {
    const stored = window.localStorage.getItem('ecommerce-session');
    return stored ? JSON.parse(stored) : { token: '', user: null };
  } catch {
    return { token: '', user: null };
  }
}

function readStoredCart() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem('ecommerce-cart');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function readStoredUserEmail() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem('ecommerce-last-email') || '';
}

function saveStoredValue(key, value) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

async function request(path, options = {}, token = '') {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

function getProductImage(product) {
  const seed = encodeURIComponent(product.name || product._id || 'product');
  return `https://picsum.photos/seed/${seed}/640/420`;
}

function App() {
  const [session, setSession] = useState(() => readStoredSession());
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState(() => readStoredCart());
  const [authForm, setAuthForm] = useState(() => ({ ...defaultAuthForm, email: readStoredUserEmail() }));
  const [authMode, setAuthMode] = useState('login');
  const [shipping, setShipping] = useState(defaultShipping);
  const [showCheckout, setShowCheckout] = useState(false);
  const [productForm, setProductForm] = useState(defaultProduct);
  const [editingProductId, setEditingProductId] = useState('');
  const [search, setSearch] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState({ products: false, auth: false, checkout: false, admin: false, orders: false });

  const isLoggedIn = Boolean(session.user && session.token);
  const isAdmin = session.user?.role === 'admin';

  useEffect(() => {
    saveStoredValue('ecommerce-session', session);
  }, [session]);

  useEffect(() => {
    saveStoredValue('ecommerce-cart', cart);
  }, [cart]);

  useEffect(() => {
    if (!session.user) {
      return;
    }

    setShipping((current) => ({
      ...current,
      fullName: current.fullName || session.user.name,
      email: current.email || session.user.email,
    }));
  }, [session.user]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setLoading((current) => ({ ...current, products: true }));

      try {
        const data = await request('/products');

        if (active) {
          setProducts(data.products || []);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error.message);
        }
      } finally {
        if (active) {
          setLoading((current) => ({ ...current, products: false }));
        }
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadOrders() {
      if (!session.token) {
        setOrders([]);
        return;
      }

      setLoading((current) => ({ ...current, orders: true }));

      try {
        const data = await request('/orders', {}, session.token);

        if (active) {
          setOrders(data.orders || []);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error.message);
        }
      } finally {
        if (active) {
          setLoading((current) => ({ ...current, orders: false }));
        }
      }
    }

    loadOrders();

    return () => {
      active = false;
    };
  }, [session.token]);

  useEffect(() => {
    if (cart.length === 0) {
      setShowCheckout(false);
    }
  }, [cart]);

  const productLookup = useMemo(() => new Map(products.map((product) => [product._id, product])), [products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return products;
    }

    return products.filter((product) => {
      const haystack = `${product.name} ${product.description} ${product.category}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [products, search]);

  const cartLines = cart
    .map((item) => {
      const product = productLookup.get(item.productId);
      return product ? { ...item, product } : null;
    })
    .filter(Boolean);

  const subtotal = cartLines.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartCount = cartLines.reduce((sum, item) => sum + item.quantity, 0);

  function showSuccess(message) {
    setStatusMessage(message);
    setErrorMessage('');
  }

  function showError(message) {
    setErrorMessage(message);
    setStatusMessage('');
  }

  function addToCart(product) {
    setCart((current) => {
      const existing = current.find((item) => item.productId === product._id);

      if (existing) {
        return current.map((item) =>
          item.productId === product._id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item,
        );
      }

      return [...current, { productId: product._id, quantity: 1 }];
    });
    showSuccess(`${product.name} added to cart.`);
  }

  function updateCartQuantity(productId, quantity) {
    if (quantity < 1) {
      setCart((current) => current.filter((item) => item.productId !== productId));
      return;
    }

    setCart((current) => current.map((item) => (item.productId === productId ? { ...item, quantity } : item)));
  }

  function clearCart() {
    setCart([]);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setLoading((current) => ({ ...current, auth: true }));

    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        authMode === 'login'
          ? { email: authForm.email, password: authForm.password }
          : { name: authForm.name, email: authForm.email, password: authForm.password };

      const data = await request(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSession(data);
      window.localStorage.setItem('ecommerce-last-email', data.user.email);
      setAuthForm({ ...defaultAuthForm, email: data.user.email });
      showSuccess(authMode === 'login' ? 'Signed in successfully.' : 'Account created and signed in.');
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading((current) => ({ ...current, auth: false }));
    }
  }

  function logout() {
    setSession({ token: '', user: null });
    setOrders([]);
    setAuthMode('login');
    setShowCheckout(false);
    setShipping(defaultShipping);
    setStatusMessage('');
    setErrorMessage('');
    showSuccess('Logged out. Please log in again.');
  }

  async function refreshOrders(token = session.token) {
    if (!token) {
      setOrders([]);
      return;
    }

    setLoading((current) => ({ ...current, orders: true }));

    try {
      const data = await request('/orders', {}, token);
      setOrders(data.orders || []);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading((current) => ({ ...current, orders: false }));
    }
  }

  async function handleCheckout(event) {
    event.preventDefault();

    if (!session.token) {
      showError('Please sign in before checking out.');
      return;
    }

    setLoading((current) => ({ ...current, checkout: true }));

    try {
      const payload = {
        items: cartLines.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        shipping,
      };

      await request(
        '/orders',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        session.token,
      );

      clearCart();
      await refreshOrders();
      setShowCheckout(false);
      showSuccess('Order placed successfully.');
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading((current) => ({ ...current, checkout: false }));
    }
  }

  async function handleProductSubmit(event) {
    event.preventDefault();

    if (!session.token || !isAdmin) {
      showError('Admin access is required for product management.');
      return;
    }

    setLoading((current) => ({ ...current, admin: true }));

    try {
      const payload = {
        ...productForm,
        price: Number(productForm.price),
        stock: Number(productForm.stock),
      };

      const wasEditing = Boolean(editingProductId);

      if (wasEditing) {
        await request(
          `/products/${editingProductId}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          },
          session.token,
        );
      } else {
        await request(
          '/products',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          session.token,
        );
      }

      const data = await request('/products');
      setProducts(data.products || []);
      setProductForm(defaultProduct);
      setEditingProductId('');
      showSuccess(wasEditing ? 'Product updated.' : 'Product created.');
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading((current) => ({ ...current, admin: false }));
    }
  }

  function beginEditProduct(product) {
    setEditingProductId(product._id);
    setProductForm({
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      stock: product.stock,
      accent: product.accent,
      featured: product.featured,
    });
  }

  async function deleteProduct(productId) {
    if (!session.token || !isAdmin) {
      showError('Admin access is required for product management.');
      return;
    }

    setLoading((current) => ({ ...current, admin: true }));

    try {
      await request(
        `/products/${productId}`,
        {
          method: 'DELETE',
        },
        session.token,
      );

      const data = await request('/products');
      setProducts(data.products || []);
      showSuccess('Product deleted.');
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading((current) => ({ ...current, admin: false }));
    }
  }

  async function updateOrderStatus(orderId, status) {
    if (!session.token || !isAdmin) {
      showError('Admin access is required for order updates.');
      return;
    }

    try {
      await request(
        `/orders/${orderId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
        session.token,
      );

      await refreshOrders();
      showSuccess('Order status updated.');
    } catch (error) {
      showError(error.message);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Welcome to E-Commerce Platform</h1>
          <p>Please log in to continue or create a new account.</p>

          <div className="auth-switch">
            <button
              type="button"
              className={authMode === 'login' ? 'tab-button active' : 'tab-button'}
              onClick={() => setAuthMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'tab-button active' : 'tab-button'}
              onClick={() => setAuthMode('register')}
            >
              Create Account
            </button>
          </div>

          {statusMessage ? <div className="banner success">{statusMessage}</div> : null}
          {errorMessage ? <div className="banner error">{errorMessage}</div> : null}

          <form className="stack-form" onSubmit={handleAuthSubmit}>
            {authMode === 'register' ? (
              <label>
                Name
                <input
                  value={authForm.name}
                  onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>
            ) : null}

            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                required
              />
            </label>

            <button className="primary-button" type="submit" disabled={loading.auth}>
              {loading.auth ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <nav className="site-navbar">
        <button className="ghost-button" onClick={logout} type="button">
          Logout
        </button>
      </nav>

      <header className="site-header">
        <h1>Welcome, {session.user.name}</h1>
        <p>Browse products, add items to cart, and continue to checkout when ready.</p>
      </header>

      <main className="page-main">
        <div className="page-grid">
          <section className="panel catalog-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Catalog</p>
                <h2>Products</h2>
              </div>
              <input
                className="search-input"
                type="search"
                placeholder="Search products"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {statusMessage ? <div className="banner success">{statusMessage}</div> : null}
            {errorMessage ? <div className="banner error">{errorMessage}</div> : null}

            <div className="product-grid">
              {loading.products ? <EmptyState text="Loading products..." /> : null}
              {!loading.products && filteredProducts.length === 0 ? <EmptyState text="No products found." /> : null}

              {filteredProducts.map((product) => (
                <ProductCard
                  key={product._id}
                  product={product}
                  onAdd={() => addToCart(product)}
                  onEdit={isAdmin ? () => beginEditProduct(product) : undefined}
                  onDelete={isAdmin ? () => deleteProduct(product._id) : undefined}
                />
              ))}
            </div>
          </section>

          <section className="panel cart-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Cart</p>
                <h2>My Cart</h2>
              </div>
              <div className="cart-total">{formatMoney(subtotal)}</div>
            </div>

            {cartLines.length === 0 ? <EmptyState text="Add products to your cart." /> : null}

            <div className="cart-list">
              {cartLines.map((item) => (
                <div className="cart-row" key={item.productId}>
                  <div>
                    <strong>{item.product.name}</strong>
                    <p>{item.product.category}</p>
                  </div>
                  <div className="cart-actions">
                    <button type="button" onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}>
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.productId, Math.min(item.quantity + 1, item.product.stock))}
                    >
                      +
                    </button>
                  </div>
                  <div className="cart-price">{formatMoney(item.product.price * item.quantity)}</div>
                </div>
              ))}
            </div>

            {cartLines.length > 0 && !showCheckout ? (
              <button className="primary-button checkout-open" type="button" onClick={() => setShowCheckout(true)}>
                Checkout
              </button>
            ) : null}

            {showCheckout ? (
              <form className="stack-form checkout-form" onSubmit={handleCheckout}>
                <label>
                  Full name
                  <input
                    value={shipping.fullName}
                    onChange={(event) => setShipping((current) => ({ ...current, fullName: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={shipping.email}
                    onChange={(event) => setShipping((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Address
                  <input
                    value={shipping.address}
                    onChange={(event) => setShipping((current) => ({ ...current, address: event.target.value }))}
                    required
                  />
                </label>
                <div className="two-col">
                  <label>
                    City
                    <input
                      value={shipping.city}
                      onChange={(event) => setShipping((current) => ({ ...current, city: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Country
                    <input
                      value={shipping.country}
                      onChange={(event) => setShipping((current) => ({ ...current, country: event.target.value }))}
                      required
                    />
                  </label>
                </div>
                <label>
                  Postal code
                  <input
                    value={shipping.postalCode}
                    onChange={(event) => setShipping((current) => ({ ...current, postalCode: event.target.value }))}
                    required
                  />
                </label>
                <div className="checkout-actions">
                  <button className="ghost-button" type="button" onClick={() => setShowCheckout(false)}>
                    Cancel
                  </button>
                  <button className="primary-button" type="submit" disabled={loading.checkout || cartLines.length === 0}>
                    {loading.checkout ? 'Placing order...' : 'Place Order'}
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="panel orders-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Orders</p>
                <h2>{isAdmin ? 'All Orders' : 'My Orders'}</h2>
              </div>
              <span className="tiny-pill">{orders.length} total</span>
            </div>

            {loading.orders ? <EmptyState text="Loading orders..." /> : null}
            {!loading.orders && orders.length === 0 ? <EmptyState text="No orders yet." /> : null}

            <div className="order-list">
              {orders.map((order) => (
                <OrderCard key={order._id} order={order} isAdmin={isAdmin} onStatusChange={updateOrderStatus} />
              ))}
            </div>
          </section>

          {isAdmin ? (
            <section className="panel admin-panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">Admin</p>
                  <h2>{editingProductId ? 'Edit Product' : 'Add Product'}</h2>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setEditingProductId('');
                    setProductForm(defaultProduct);
                  }}
                >
                  Reset
                </button>
              </div>

              <form className="stack-form" onSubmit={handleProductSubmit}>
                <label>
                  Name
                  <input
                    value={productForm.name}
                    onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Description
                  <textarea
                    rows="4"
                    value={productForm.description}
                    onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))}
                    required
                  />
                </label>
                <div className="two-col">
                  <label>
                    Category
                    <input
                      value={productForm.category}
                      onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Accent
                    <input
                      type="color"
                      value={productForm.accent}
                      onChange={(event) => setProductForm((current) => ({ ...current, accent: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="two-col">
                  <label>
                    Price
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={productForm.price}
                      onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Stock
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.stock}
                      onChange={(event) => setProductForm((current) => ({ ...current, stock: event.target.value }))}
                      required
                    />
                  </label>
                </div>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={productForm.featured}
                    onChange={(event) => setProductForm((current) => ({ ...current, featured: event.target.checked }))}
                  />
                  Featured product
                </label>
                <button className="primary-button" type="submit" disabled={loading.admin}>
                  {loading.admin ? 'Saving...' : editingProductId ? 'Update Product' : 'Create Product'}
                </button>
              </form>
            </section>
          ) : null}
        </div>
      </main>

      <footer className="site-footer">
        <p>Logged in as {session.user.email}</p>
      </footer>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function ProductCard({ product, onAdd, onEdit, onDelete }) {
  return (
    <article className="product-card">
      <img className="product-image" src={getProductImage(product)} alt={product.name} loading="lazy" />
      <div className="product-accent" style={{ background: product.accent }} />
      <div className="product-content">
        <div className="product-head">
          <span className="tiny-pill">{product.category}</span>
          {product.featured ? <span className="featured-pill">Featured</span> : null}
        </div>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="product-footer">
          <div>
            <strong>{formatMoney(product.price)}</strong>
            <span>{product.stock} in stock</span>
          </div>
          <div className="button-row">
            {onEdit ? (
              <button type="button" className="ghost-button small" onClick={onEdit}>
                Edit
              </button>
            ) : null}
            {onDelete ? (
              <button type="button" className="ghost-button small danger" onClick={onDelete}>
                Delete
              </button>
            ) : null}
            <button type="button" className="primary-button small" onClick={onAdd}>
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function OrderCard({ order, isAdmin, onStatusChange }) {
  return (
    <article className="order-card">
      <div className="order-head">
        <div>
          <strong>{order.orderNumber}</strong>
          <p>{new Date(order.createdAt).toLocaleString()}</p>
        </div>
        <div className="order-meta">
          <span className="status-pill">{order.status}</span>
          <strong>{formatMoney(order.subtotal)}</strong>
        </div>
      </div>

      <div className="order-items">
        {order.items.map((item) => (
          <div key={`${order._id}-${item.name}`} className="order-item">
            <span>{item.name}</span>
            <span>
              {item.quantity} x {formatMoney(item.price)}
            </span>
          </div>
        ))}
      </div>

      <p className="order-ship">Ship to {order.shipping.fullName} | {order.shipping.city}</p>

      {isAdmin ? (
        <div className="status-controls">
          {['Placed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'].map((status) => (
            <button key={status} type="button" className="ghost-button tiny" onClick={() => onStatusChange(order._id, status)}>
              {status}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default App;
