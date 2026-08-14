INSERT INTO obsidian_account_farm_annotations(account_id,event_type,title,details,occurred_at)
SELECT usage.account_id,
       'pickaxe_changed',
       'Pickaxe changed',
       jsonb_build_object(
         'name', usage.tool_name,
         'blocksMined', usage.blocks_mined,
         'remainingPercent', usage.remaining_percent,
         'durabilityUsed', usage.durability_used,
         'sourceToolUsageId', usage.id,
         'backfilled', TRUE
       ),
       usage.changed_at
FROM obsidian_account_farm_tool_usage usage
WHERE NOT EXISTS (
  SELECT 1
  FROM obsidian_account_farm_annotations annotation
  WHERE annotation.account_id=usage.account_id
    AND annotation.event_type='pickaxe_changed'
    AND annotation.details->>'sourceToolUsageId'=usage.id::text
);
