import React from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { assets, money } from "./data";
export default function Home({ shop, products, openProduct }) {
  return (
    <main className="home-v2">
      <section className="home-v2-hero">
        <div>
          <span>LINY JAYA · DAILY ESSENTIALS</span>
          <h1>
            Nyaman dipakai.
            <br />
            Mudah jadi favorit.
          </h1>
          <p>
            Koleksi pakaian sehari-hari untuk gaya, aktivitas, dan cerita Anda.
          </p>
          <button onClick={() => shop("Semua", "Wanita")}>
            Temukan koleksi
            <ArrowRight size={18} />
          </button>
          <small>Wanita · Pria · Anak · Bayi</small>
        </div>
        <div className="home-v2-image">
          <img
            src={assets.editorial}
            alt="Pilihan pakaian sehari-hari Liny Jaya"
          />
          <span>Pilihan esensial, untuk setiap hari.</span>
        </div>
      </section>
      <section className="home-v2-departments">
        <div className="home-v2-heading">
          <div>
            <span>MULAI DARI PILIHAN ANDA</span>
            <h2>Belanja untuk siapa hari ini?</h2>
          </div>
          <button onClick={() => shop()}>
            Lihat katalog
            <ArrowUpRight size={17} />
          </button>
        </div>
        <div>
          {[
            ["Wanita", assets.hero, "Untuk setiap sisi diri Anda"],
            ["Pria", assets.men, "Esensial yang selalu relevan"],
            ["Anak", assets.kids, "Bebas bergerak dan bermain"],
            ["Bayi", assets.baby, "Lembut untuk hari-hari pertama"],
          ].map(([g, img, sub]) => (
            <button key={g} onClick={() => shop("Semua", g)}>
              <img src={img} alt={"Koleksi " + g} />
              <div>
                <span>
                  <b>{g}</b>
                  <small>{sub}</small>
                </span>
                <ArrowRight size={19} />
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="home-v2-arrivals">
        <div className="home-v2-heading">
          <div>
            <span>PILIHAN KATALOG</span>
            <h2>Mulai dengan yang Anda suka.</h2>
          </div>
          <button onClick={() => shop("Produk Baru")}>
            Semua produk
            <ArrowRight size={17} />
          </button>
        </div>
        <div>
          {products
            .filter((p) => p.gender === "Wanita")
            .slice(0, 4)
            .map((p) => (
              <button key={p.id} onClick={() => openProduct(p)}>
                <img src={p.image} alt={p.name} loading="lazy" />
                <span>{p.category}</span>
                <h3>{p.name}</h3>
                <b>{money(p.price)}</b>
              </button>
            ))}
        </div>
      </section>
      <section className="home-v2-benefits">
        {[
          {
            icon: Truck,
            title: "Pengiriman pilihan Anda",
            text: "Reguler, ekspres, atau pengambilan pesanan.",
          },
          {
            icon: ShieldCheck,
            title: "Pembayaran melalui Xendit",
            text: "Pilih metode pada halaman pembayaran yang aman.",
          },
          {
            icon: Package,
            title: "Pantau dari akun Anda",
            text: "Lihat status pesanan dan rincian belanja dalam satu tempat.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <Icon size={25} />
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
