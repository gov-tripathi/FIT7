import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { Search, ShoppingCart, Package as PackageIcon, Plus, Minus, Trash2 } from "lucide-react";
import { http } from "../api";
import type { Order, Product } from "../types";

interface CartItem extends Product {
  quantity: number;
}

export default function Orders() {
  const location = useLocation() as { state?: { queries?: string[]; suggestion_id?: string } };
  const seedQueries = location.state?.queries ?? [];
  const suggestionId = location.state?.suggestion_id;

  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [placing, setPlacing] = useState(false);

  const [address, setAddress] = useState({
    name: "",
    line1: "",
    city: "",
    zip: "",
    country: "US",
  });

  const loadOrders = () => http.get<Order[]>("/orders").then(setOrders).catch(() => {});

  useEffect(() => {
    loadOrders();
    if (seedQueries.length) {
      setQ(seedQueries[0]);
      search(seedQueries[0]);
    } else {
      search("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async (query: string) => {
    try {
      const r = await http.get<Product[]>(
        `/orders/search?q=${encodeURIComponent(query)}`
      );
      setResults(r);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const add = (p: Product) => {
    setCart((c) => {
      const idx = c.findIndex((i) => i.product_id === p.product_id);
      if (idx >= 0) {
        const next = [...c];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...c, { ...p, quantity: 1 }];
    });
  };

  const bump = (id: string, delta: number) =>
    setCart((c) =>
      c
        .map((i) =>
          i.product_id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
        )
        .filter((i) => i.quantity > 0)
    );

  const remove = (id: string) =>
    setCart((c) => c.filter((i) => i.product_id !== id));

  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.price * i.quantity, 0),
    [cart]
  );

  const placeOrder = async () => {
    if (!cart.length) return toast.error("Cart is empty");
    if (!address.line1 || !address.city || !address.zip || !address.name)
      return toast.error("Fill in delivery address");
    setPlacing(true);
    try {
      await http.post("/orders/place", {
        items: cart.map((i) => ({
          product_id: i.product_id,
          name: i.name,
          quantity: i.quantity,
          unit_price: i.price,
          image_url: i.image_url,
        })),
        delivery_name: address.name,
        delivery_address: {
          line1: address.line1,
          city: address.city,
          zip: address.zip,
          country: address.country,
        },
        suggestion_id: suggestionId,
      });
      toast.success("Order placed");
      setCart([]);
      loadOrders();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="speed-chip">Gear</span>
          <span className="text-[11px] font-display uppercase tracking-brutal text-slate-500">
            Supplement store
          </span>
        </div>
        <h1 className="section-title text-3xl sm:text-4xl">Orders</h1>
        <p className="text-sm text-slate-400 mt-3">
          Search supplements via the MCP storefront and order in one click.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <div className="card">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  className="input pl-10"
                  placeholder="whey protein, magnesium, creatine…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search(q)}
                />
              </div>
              <button className="btn-primary" onClick={() => search(q)}>
                Search
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {results.map((p) => (
              <div key={p.product_id} className="card flex gap-3 !p-4">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt=""
                    className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg object-cover bg-slate-800 shrink-0"
                  />
                ) : (
                  <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg bg-slate-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium leading-tight text-sm sm:text-base">
                    {p.name}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {p.description}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="font-semibold">${p.price.toFixed(2)}</div>
                    <button
                      className="btn-primary !py-1.5 !px-3"
                      onClick={() => add(p)}
                    >
                      <Plus className="h-4 w-4" /> Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Order history</h3>
            {orders.length === 0 ? (
              <div className="text-slate-500 text-sm">No orders yet.</div>
            ) : (
              <div className="divide-y divide-slate-800">
                {orders.map((o) => (
                  <div key={o.id} className="py-3 flex items-center gap-3">
                    <PackageIcon className="h-5 w-5 text-brand-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {o.items.map((i) => i.name).join(", ")}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {new Date(o.placed_at).toLocaleString()} · {o.mcp_provider}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">
                        ${o.total?.toFixed(2)}
                      </div>
                      <span className="pill bg-lime-400/10 text-lime-400 ring-lime-400/30">
                        {o.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card h-fit lg:sticky lg:top-24">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart className="h-4 w-4 text-brand-400" />
            <h3 className="font-semibold">Cart</h3>
          </div>
          {cart.length === 0 ? (
            <div className="text-slate-500 text-sm">Empty.</div>
          ) : (
            <div className="space-y-2">
              {cart.map((i) => (
                <div key={i.product_id} className="rounded-lg border border-slate-800 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium leading-tight">{i.name}</div>
                    <button onClick={() => remove(i.product_id)} aria-label="Remove">
                      <Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-400" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => bump(i.product_id, -1)}
                        className="h-6 w-6 rounded bg-slate-800 flex items-center justify-center"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm">{i.quantity}</span>
                      <button
                        onClick={() => bump(i.product_id, 1)}
                        className="h-6 w-6 rounded bg-slate-800 flex items-center justify-center"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-sm">${(i.price * i.quantity).toFixed(2)}</div>
                  </div>
                </div>
              ))}
              <div className="border-t border-slate-800 pt-3 mt-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">Subtotal</span>
                <span className="font-semibold">${subtotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={address.name}
                onChange={(e) => setAddress({ ...address, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Address</label>
              <input
                className="input"
                value={address.line1}
                onChange={(e) => setAddress({ ...address, line1: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">City</label>
                <input
                  className="input"
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Zip</label>
                <input
                  className="input"
                  value={address.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                />
              </div>
            </div>
          </div>

          <button
            className="btn-primary w-full mt-4"
            onClick={placeOrder}
            disabled={placing || !cart.length}
          >
            {placing ? "Placing…" : `Place order · $${subtotal.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
