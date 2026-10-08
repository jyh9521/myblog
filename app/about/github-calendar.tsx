'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    GitHubCalendar?: (container: HTMLElement, username: string, options?: Record<string, unknown>) => Promise<unknown>;
  }
}

let calendarLibrary: Promise<void> | undefined;

function loadCalendarLibrary() {
  if (!calendarLibrary) {
    calendarLibrary = new Promise<void>((resolve, reject) => {
      const styleId = 'github-calendar-responsive-css';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('link');
        style.id = styleId;
        style.rel = 'stylesheet';
        style.href = 'https://unpkg.com/github-calendar@2.3.4/dist/github-calendar-responsive.css';
        document.head.appendChild(style);
      }

      if (window.GitHubCalendar) { resolve(); return; }
      const existing = document.querySelector<HTMLScriptElement>('script[data-github-calendar]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('GitHub 日历脚本加载失败')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.dataset.githubCalendar = 'true';
      script.src = 'https://unpkg.com/github-calendar@2.3.4/dist/github-calendar.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('GitHub 日历脚本加载失败'));
      document.body.appendChild(script);
    });
  }
  return calendarLibrary;
}

export default function GitHubContributionCalendar() {
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    const container = calendarRef.current;
    if (!container) return;

    loadCalendarLibrary().then(() => {
      if (!mounted || !container || !window.GitHubCalendar) return;
      container.innerHTML = '';
      return window.GitHubCalendar(container, 'jyh9521', {
        responsive: true,
        tooltips: true,
        global_stats: false,
        summary_text: '伯翎飞云在 GitHub 上的公开贡献记录',
      });
    }).catch(() => {
      if (mounted && container) container.textContent = 'GitHub 贡献日历暂时无法加载。';
    });

    return () => { mounted = false; };
  }, []);

  return <div className="github-calendar-card">
    <div className="section-title"><div><span className="section-kicker">OPEN SOURCE</span><h2>GitHub 贡献</h2></div><a className="read-more" href="https://github.com/jyh9521" target="_blank" rel="noopener noreferrer">查看 GitHub →</a></div>
    <div ref={calendarRef} className="github-calendar" aria-live="polite">正在加载 GitHub 贡献日历…</div>
  </div>;
}
