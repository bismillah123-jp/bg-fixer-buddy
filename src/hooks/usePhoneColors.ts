import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PhoneColor {
  id: string;
  name: string;
  hex_color: string;
  created_at: string;
}

export function usePhoneColors() {
  return useQuery({
    queryKey: ['phone-colors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phone_colors' as any)
        .select('*')
        .order('name');
      if (error) throw error;
      return data as unknown as PhoneColor[];
    }
  });
}
