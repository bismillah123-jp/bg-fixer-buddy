import { BarChart3, Package, TrendingUp, Settings, ListTree, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileNavigationProps {
  activeTab: 'dashboard' | 'table' | 'stock-detail' | 'analytics' | 'ai-chat' | 'settings';
  onTabChange: (tab: 'dashboard' | 'table' | 'stock-detail' | 'analytics' | 'ai-chat' | 'settings') => void;
}

export function MobileNavigation({ activeTab, onTabChange }: MobileNavigationProps) {
  type TabId = 'dashboard' | 'table' | 'stock-detail' | 'analytics' | 'ai-chat' | 'settings';
  const navItems: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
    { id: 'dashboard', label: 'Home', icon: BarChart3 },
    { id: 'table', label: 'Data', icon: Package },
    { id: 'stock-detail', label: 'Detail', icon: ListTree },
    { id: 'analytics', label: 'Stats', icon: TrendingUp },
    { id: 'ai-chat', label: 'AI', icon: Sparkles },
    { id: 'settings', label: 'Setting', icon: Settings },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-border/60" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <Button
              key={item.id}
              variant="ghost"
              size="sm"
              onClick={() => onTabChange(item.id)}
              className={`relative flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-xl pressable ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {isActive && (
                <span className="absolute -top-[9px] h-1 w-8 rounded-full bg-gradient-to-r from-primary to-[#c22436] shadow-[var(--shadow-glow)]" />
              )}
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
              <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}