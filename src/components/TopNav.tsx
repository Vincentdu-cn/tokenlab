import { Moon, Sun } from 'lucide-react';
import type { NavTab } from '../types/benchmark';

interface TopNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string }> = [
  { id: 'workbench', label: '测试工作台' },
  { id: 'providers', label: '提供商与模型' },
  { id: 'prompts', label: '测试集' },
  { id: 'reports', label: '对比报告' },
  { id: 'history', label: '运行历史' },
  { id: 'mcp', label: 'MCP 服务' },
];

function TokenLabLogo() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5"
        className="stroke-[#2563EB] dark:stroke-blue-400"
        strokeWidth="1.75"
      />
      <path
        d="M6.5 12H9.2L11 7.5L13.2 16.5L15 12H17.5"
        className="stroke-slate-900 dark:stroke-slate-100"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TopNav({
  activeTab,
  onSelectTab,
  theme,
  onToggleTheme,
}: TopNavProps) {
  return (
    <header className="md:sticky md:top-0 z-30 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 md:gap-8">
        <a
          href="#workbench"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('workbench');
          }}
          className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
        >
          <TokenLabLogo />
          <span>TokenLab</span>
        </a>

        <nav
          aria-label="主导航"
          className="hidden md:flex items-center gap-7"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                  isActive
                    ? 'text-slate-900 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-[#2563EB] dark:bg-blue-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>浅色</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                <span>深色</span>
              </>
            )}
          </button>
        </div>
      </div>

      <nav
        aria-label="移动端主导航"
        className="md:hidden border-t border-slate-100 dark:border-slate-800 px-4 flex items-center justify-between gap-2 overflow-x-auto"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'text-[#2563EB] dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-[#2563EB] dark:bg-blue-400"
                />
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
