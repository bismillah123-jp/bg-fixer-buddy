import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useLabels() {
  return useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labels')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    }
  });
}
