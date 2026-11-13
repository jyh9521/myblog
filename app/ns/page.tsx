import type { Metadata } from 'next';
import './ns.css';
import NsVisitorCounter from './visitor-counter';

export const metadata: Metadata = {
  title: 'NS群群号发布页',
  description: 'AcFun NS ⑨课二维码。',
};

export default function NsGroupPage() {
  return <main className="ns-page">
    <section className="ns-hero-shell">
      <div className="container ns-hero">
        <div className="ns-hero-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> 伯翎飞云 · NS 群聊入口</span>
          <h1>你群最新群号<span className="hero-stop">。</span></h1>
          <p>我操怎么群又炸了？</p>
          <a className="hero-button" href="#ns-info">查看群聊信息 <span aria-hidden="true">↓</span></a>
        </div>
        <div className="ns-qr-stage" id="join">
          <div className="ns-qr-orbit ns-qr-orbit-one" />
          <div className="ns-qr-orbit ns-qr-orbit-two" />
          <div className="ns-qr-note">SCAN TO JOIN</div>
          <figure className="ns-qr-card">
            <img src="/ns/img/qun.jpg" alt="AcFun NS ⑨课群聊入群二维码" />
            <figcaption>扫一扫二维码，加入群聊</figcaption>
          </figure>
          <span className="ns-qr-spark" aria-hidden="true">✦</span>
        </div>
      </div>
    </section>

    <section className="container ns-content" id="ns-info">
      <div className="section-title">
        <div><span className="section-kicker">NS COMMUNITY</span><h2>群聊与公告</h2></div>
        <span className="article-count">常回家看看</span>
      </div>
      <div className="ns-card-grid">
        <article className="ns-card ns-announcement">
          <div className="ns-card-heading"><span className="ns-card-index">01</span><div><span className="ns-card-kicker">NOTICE</span><h3>公告说明</h3></div></div>
          <p className="ns-announcement-text">常回家看看🎶回家看看🎵</p>
          <p className="ns-card-hint">群炸的时候，请以本页更新内容为准。</p>
        </article>

        <article className="ns-card ns-music-card">
          <div className="ns-card-heading"><span className="ns-card-index ns-card-index-yellow">02</span><div><span className="ns-card-kicker">NOW PLAYING</span><h3>常回家看看</h3></div></div>
          <div className="ns-track">
            <span className="ns-track-art" aria-hidden="true">♪</span>
            <div><strong>常回家看看</strong><span>陈红</span></div>
          </div>
          <audio controls autoPlay preload="auto" src="/ns/audio/changhuijiakankan.mp3">你的浏览器不支持音频播放。</audio>
          <p className="ns-card-hint">如果没有自动播放，请点上方的播放键。</p>
        </article>

        <aside className="ns-card ns-counter-card">
          <div className="ns-counter-top"><span className="ns-card-kicker">VISITORS</span><span className="ns-counter-eye" aria-hidden="true">◉</span></div>
          <p>已到访人数</p>
          <NsVisitorCounter />
          <span className="ns-counter-footnote">每次打开页面计为一次到访</span>
        </aside>
      </div>
    </section>
  </main>;
}
