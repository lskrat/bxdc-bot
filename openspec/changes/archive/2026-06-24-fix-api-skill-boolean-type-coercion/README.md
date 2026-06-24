# fix-api-skill-boolean-type-coercion

Fix the bug where boolean parameters defined in API skill's parameterContract are sometimes sent as strings ('true'/'True'/'TRUE') instead of actual boolean values, by adding type coercion to mergeDefaults based on the parameterContract type definitions.
