import { useEffect, useMemo, useState } from 'react';

const API_ROOT = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const IS_REMOTE_DEPLOYMENT =
  typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname);

const demoAccounts = [
  {
    label: 'Admin',
    email: 'admin@shop.local',
    password: 'Admin123!',
    role: 'admin',
  },
  {
    label: 'Customer',
    email: 'customer@shop.local',
    password: 'User123!',
    role: 'user',
  },
];

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

const defaultLogin = { email: '', password: '' };

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

function App() {
  const [session, setSession] = useState(() => readStoredSession());
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState(() => readStoredCart());
  const [loginForm, setLoginForm] = useState(defaultLogin);
  const [shipping, setShipping] = useState(defaultShipping);
  const [productForm, setProductForm] = useState(defaultProduct);
  const [editingProductId, setEditingProductId] = useState('');
  const [search, setSearch] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState({ products: false, auth: false, checkout: false, admin: false, orders: false });

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
  }, [session.token, session.user?.role]);

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
  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);

  const topCategory = useMemo(() => {
    const counts = new Map();

    for (const product of products) {
      counts.set(product.category, (counts.get(product.category) || 0) + 1);
    }

    const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return winner ? winner[0] : 'Catalog';
  }, [products]);

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

  async function handleLogin(event) {
    event.preventDefault();
    setLoading((current) => ({ ...current, auth: true }));

    try {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });

      setSession(data);
      setLoginForm(defaultLogin);
      showSuccess(`Signed in as ${data.user.name}.`);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading((current) => ({ ...current, auth: false }));
    }
  }

  function handleDemoFill(account) {
    setLoginForm({ email: account.email, password: account.password });
  }

  function logout() {
    setSession({ token: '', user: null });
    setOrders([]);
    setLoginForm(defaultLogin);
    setShipping(defaultShipping);
    showSuccess('Signed out.');
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

  const deploymentNotice =
    IS_REMOTE_DEPLOYMENT && API_ROOT === '/api'
      ? 'Set VITE_API_URL to your Render backend before building the GitHub Pages frontend.'
      : '';

  return (
    <div className="app-shell">
      <nav className="site-navbar">
        <div className="brand">E-Commerce Platform</div>
        <div className="nav-links">
          <a href="#products">Products</a>
          <a href="#cart">Cart ({cartCount})</a>
          <a href="#orders">Orders</a>
          <a href="#account">Account</a>
          {isAdmin ? <a href="#admin">Admin</a> : null}
        </div>
      </nav>

      <header className="site-header">
        <div>
          <p className="header-kicker">Modern Online Store</p>
          <h1>Shop smarter with fast checkout and live order tracking</h1>
          <p className="header-copy">
            Browse curated products, manage your cart, and place orders in a clean workflow built for web deployment.
          </p>
        </div>

        <div className="hero-metrics">
          <Metric label="Products" value={products.length} />
          <Metric label="Cart Items" value={cartCount} />
          <Metric label="In Stock" value={totalStock} />
          <Metric label="Top Category" value={topCategory} compact />
        </div>

        {deploymentNotice ? <div className="banner warning">{deploymentNotice}</div> : null}
        {statusMessage ? <div className="banner success">{statusMessage}</div> : null}
        {errorMessage ? <div className="banner error">{errorMessage}</div> : null}
      </header>

      <main className="page-main">
        <div className="page-grid">
        <aside className="panel auth-panel" id="account">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Account</p>
              <h2>{session.user ? 'Signed in' : 'Sign in to checkout'}</h2>
            </div>
            {session.user ? (
              <button className="ghost-button" onClick={logout} type="button">
                Logout
              </button>
            ) : null}
          </div>

          {session.user ? (
            <div className="account-summary">
              <div>
                <span className="meta-label">Name</span>
                <strong>{session.user.name}</strong>
              </div>
              <div>
                <span className="meta-label">Email</span>
                <strong>{session.user.email}</strong>
              </div>
              <div>
                <span className="meta-label">Role</span>
                <strong className="role-pill">{session.user.role}</strong>
              </div>
            </div>
          ) : (
            <form className="stack-form" onSubmit={handleLogin}>
              <label>
                Email
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="admin@shop.local"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="password"
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={loading.auth}>
                {loading.auth ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          <div className="demo-panel">
            <div className="panel-subheading">Demo Accounts</div>
            <div className="demo-grid">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="demo-card"
                  onClick={() => handleDemoFill(account)}
                >
                  <span>{account.label}</span>
                  <strong>{account.email}</strong>
                  <small>{account.password}</small>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="panel catalog-panel" id="products">
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

        <section className="panel cart-panel" id="cart">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Cart</p>
              <h2>Checkout</h2>
            </div>
            <div className="cart-total">{formatMoney(subtotal)}</div>
          </div>

          {cartLines.length === 0 ? <EmptyState text="Add products to start a cart." /> : null}

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
            <button className="primary-button" type="submit" disabled={loading.checkout || cartLines.length === 0}>
              {loading.checkout ? 'Placing order...' : 'Place Order'}
            </button>
          </form>
        </section>

        <section className="panel orders-panel" id="orders">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Tracking</p>
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
          <section className="panel admin-panel" id="admin">
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
        <p>E-Commerce Platform</p>
        <p>Built with React, Express, MongoDB, GitHub Pages, and Render</p>
      </footer>
    </div>
  );
}

function Metric({ label, value, compact = false }) {
  return (
    <div className={`metric ${compact ? 'metric-compact' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function ProductCard({ product, onAdd, onEdit, onDelete }) {
  return (
    <article className="product-card">
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