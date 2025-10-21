-- Function to update a brand's name
create or replace function update_brand_name(old_name text, new_name text)
returns void as $$
begin
  update phone_models
  set brand = new_name
  where brand = old_name;
end;
$$ language plpgsql;

-- Function to delete a brand and all its models
create or replace function delete_brand(brand_name text)
returns void as $$
begin
  delete from phone_models
  where brand = brand_name;
end;
$$ language plpgsql;
