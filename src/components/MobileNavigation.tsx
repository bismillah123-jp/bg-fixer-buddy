import { BarChart3, Package, TrendingUp, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileNavigationProps {
  activeTab: 'dashboard' | 'table' | 'analytics' | 'settings';
  onTabChange: (tab: 'dashboard' | 'table' | 'analytics' | 'settings') => void;
}

export function MobileNavigation({ activeTab, onTabChange }: MobileNavigationProps) {
  const navItems = [
    { id: 'dashboard', label: 'Home', icon: BarChart3 },
    { id: 'table', label: 'Stok', icon: Package },
    { id: 'analytics', label: 'Stats', icon: TrendingUp },
    { id: 'settings', label: 'Setting', icon: SettingsIcon },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-40">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              variant="ghost"
              size="sm"
              onClick={() => onTabChange(item.id as any)}
              className={`flex flex-col items-center gap-1 h-auto py-2 px-2 ${
                activeTab === item.id ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}