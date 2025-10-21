import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useRealtimeSubscription() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to stock_entries changes
    const stockEntriesSubscription = supabase
      .channel('stock_entries_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_entries'
        },
        (payload) => {
          console.log('Stock entries changed:', payload);
          // Invalidate all stock-related queries
          queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['kpi-stats'] });
          queryClient.invalidateQueries({ queryKey: ['daily-sales-chart'] });
          queryClient.invalidateQueries({ queryKey: ['stock-composition'] });
        }
      )
      .subscribe();

    // Subscribe to stock_events changes
    const stockEventsSubscription = supabase
      .channel('stock_events_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_events'
        },
        (payload) => {
          console.log('Stock events changed:', payload);
          // Invalidate all queries when events change
          queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['kpi-stats'] });
          queryClient.invalidateQueries({ queryKey: ['daily-sales-chart'] });
          queryClient.invalidateQueries({ queryKey: ['stock-composition'] });
        }
      )
      .subscribe();

    // Subscribe to phone_models changes
    const phoneModelsSubscription = supabase
      .channel('phone_models_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'phone_models'
        },
        (payload) => {
          console.log('Phone models changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['phone-models'] });
          queryClient.invalidateQueries({ queryKey: ['brands'] });
          queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
        }
      )
      .subscribe();

    // Subscribe to stock_locations changes
    const stockLocationsSubscription = supabase
      .channel('stock_locations_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_locations'
        },
        (payload) => {
          console.log('Stock locations changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['locations'] });
          queryClient.invalidateQueries({ queryKey: ['stock-entries'] });
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      stockEntriesSubscription.unsubscribe();
      stockEventsSubscription.unsubscribe();
      phoneModelsSubscription.unsubscribe();
      stockLocationsSubscription.unsubscribe();
    };
  }, [queryClient]);
}

