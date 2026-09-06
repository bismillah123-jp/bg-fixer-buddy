import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const STOCK_KEYS = [
  'stock-entries',
  'dashboard-stats',
  'kpi-stats',
  'daily-sales-chart',
  'stock-composition',
  'best-selling-models',
  'stock-analytics',
  'stock-detail',
];

export function useRealtimeSubscription() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidate = (keys: string[]) => {
      keys.forEach((key) =>
        queryClient.invalidateQueries({ queryKey: [key], refetchType: 'all' })
      );
    };

    const channel = supabase
      .channel('app-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_entries' },
        () => invalidate(STOCK_KEYS)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_events' },
        () => invalidate(STOCK_KEYS)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'phone_models' },
        () => invalidate([...STOCK_KEYS, 'phone-models', 'brands'])
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_locations' },
        () => invalidate([...STOCK_KEYS, 'locations', 'stock-locations', 'stock-locations-names'])
      )
      .subscribe();

    // Safety net: refresh when the device comes back online or the tab regains focus
    const refreshAll = () => invalidate(STOCK_KEYS);
    window.addEventListener('online', refreshAll);

    return () => {
      window.removeEventListener('online', refreshAll);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
