## 1. 鏁版嵁搴?& Entity 鍩虹

- [x] 1.1 鍦?`backend/skill-gateway/src/main/resources/schema-mysql.sql` 杩藉姞 2 寮犺〃 DDL锛坄external_service` 13 瀛楁 + `external_service_input` 12 瀛楁锛涘惈 `auth_config` JSON 鍒楋級
- [x] 1.2 鍦?`backend/skill-gateway/src/main/java/.../config/SchemaMigrationRunner.java` 鍔?`migrateExternalService()` + `migrateExternalServiceInput()` 涓や釜骞傜瓑 `CREATE TABLE IF NOT EXISTS` 鏂规硶锛堟寜 AGENTS.md 搂5.3 妯″紡锛孒IGHEST_PRECEDENCE 鍦ㄦ墍鏈?ApplicationRunner 涔嬪墠锛?
- [x] 1.3 鍒涘缓 `entity/ExternalService.java`锛圡yBatis-Plus `@TableName("external_service")`锛?3 瀛楁锛沗@TableField(typeHandler = JacksonTypeHandler.class)` 澶勭悊 `auth_config` JSON锛?
- [x] 1.4 鍒涘缓 `entity/ExternalServiceInput.java`锛圡yBatis-Plus `@TableName("external_service_input")`锛?2 瀛楁锛?
- [x] 1.5 鍒涘缓 `mapper/ExternalServiceMapper.java`锛坋xtends `BaseMapper<ExternalService>`锛? `mapper/ExternalServiceInputMapper.java`锛坋xtends `BaseMapper<ExternalServiceInput>`锛?
- [x] 1.6 鍒涘缓 `mapper/xml/ExternalServiceMapper.xml`锛坄listEnabled()` 鎸?`display_order ASC, id ASC` 鎺掑簭锛? `mapper/xml/ExternalServiceInputMapper.xml`锛坄listByServiceId(serviceId)` 鎸?`display_order ASC, id ASC` 鎺掑簭锛?
- [x] 1.7 鍒涘缓 `dto/ExternalServiceRequest.java`锛坅dmin 澧炴敼 DTO锛氫富琛ㄥ瓧娈?+ `List<ExternalServiceInputRequest> inputs`锛?
- [x] 1.8 鍒涘缓 `dto/ExternalServiceInputRequest.java`锛堝瓙琛?DTO锛?
- [x] 1.9 鍒涘缓 `dto/ExternalServiceView.java`锛堝嚭鍙?DTO锛氳劚鏁忓悗鐨?`auth_config`锛沗valueStatic` 瀵归潪 admin 杩斿洖 `***MASKED-XXXX***` 鍙樉鍚?4 浣嶏級

## 2. AuthConfigParser锛坅uth_config JSON 瑙ｆ瀽锛?

- [x] 2.1 鍒涘缓 `service/AuthConfigParser.java`锛堝寘瑁?Jackson `ObjectMapper`锛沗getString(key, default)` / `getDecryptedString(key)` / `getJsonNode(key)` / `getLong(key, default)` 鏂规硶锛?
- [x] 2.2 鍦?`AuthConfigParser` 涓 `valueStatic` 瀛楁璇诲嚭鍚庣珛鍗?`AesCipher.decrypt()`锛堟瀯閫犳椂浼犲叆瀵嗘枃 + 瑙﹀彂瑙ｅ瘑锛涢伩鍏嶆槑鏂囧父椹诲唴瀛橈級
- [x] 2.3 `AuthConfigParser.parse(svc.getAuthConfig(), svc.getAuthKind())` 闈欐€佸伐鍘傦紱鎸?`auth_kind` 鏍￠獙蹇呭～瀛楁锛坄apiKey` 蹇呴』鏈?`headerName`+`valueStatic`锛沗bearer` 蹇呴』鏈?`valueStatic`锛沗dynamicToken` 蹇呴』鏈?`tokenEndpoint`+`tokenPath`+`tokenRequestBody`+`cacheSeconds`锛夛紱缂哄瓧娈垫姏 `IllegalArgumentException`锛堝甫鍙娑堟伅锛?

## 3. ExternalServiceRegistry锛堝甫缂撳瓨鐨勬敞鍐岃〃鏈嶅姟锛?

- [x] 3.1 鍒涘缓 `service/ExternalServiceRegistry.java`锛坄@Service`锛涙瀯閫犳椂 `@PostConstruct` 璋?`loadAll()` 涓€娆℃€у姞杞藉埌 `ConcurrentHashMap<Long, ExternalService>` + `ConcurrentHashMap<Long, List<ExternalServiceInput>>`锛?
- [x] 3.2 瀹炵幇 `getByIdOrThrow(Long id)` / `getByNameOrThrow(String name)` / `listEnabled()` / `listInputs(Long serviceId)` 鏂规硶
- [x] 3.3 瀹炵幇 `invalidateAll()` / `invalidateService(Long serviceId)` 鏂规硶锛堟竻绌虹紦瀛橈紝涓嬫璁块棶鏃堕噸鏂颁粠 DB 鍔犺浇锛?
- [x] 3.4 瀹炵幇 `assertExists(String serviceName)` 鏂规硶锛堟湇鍔′笉瀛樺湪鎴?`enabled=0` 鏃舵姏 `IllegalArgumentException`锛?
- [x] 3.5 瀹炵幇 5 鍒嗛挓 TTL 鍚庡彴绾跨▼锛坄@Scheduled(fixedRate = 300_000)` 鎴?`Executors.newSingleThreadScheduledExecutor`锛涘埌鏈熷叏閲忛噸杞斤紱涓?`python_sandbox` 鐨?`PythonSandboxRegistry` 缂撳瓨妯″紡涓€鑷达級

## 4. DynamicTokenCache锛坉ynamicToken 妯″紡鏈湴缂撳瓨锛?

- [x] 4.1 鍒涘缓 `service/DynamicTokenCache.java`锛坄ConcurrentHashMap<String, CachedToken>`锛沗CachedToken { String token; long expiresAt; }`锛?
- [x] 4.2 瀹炵幇 `getOrFetch(ExternalService svc, AuthConfigParser authCfg)` 鏂规硶锛坄synchronized(svc.getName().intern())` 鍗曢锛涜皟 `ApiProxyService.callApi(tokenEndpoint, "POST", emptyHeaders, tokenRequestBody, HttpClientAuditMode.NONE, 10_000)` 鎷垮搷搴旓級
- [x] 4.3 鍦ㄥ搷搴旇В鏋愪腑浣跨敤 `JsonPathUtils.read(responseBody, tokenPath)`锛堟部鐢ㄧ幇鏈?`JsonPathUtils` 宸ュ叿绫伙級鎻愬彇 token锛涚紦瀛樺埌 `cache` map锛宍expiresAt = now + cacheSeconds * 1000L`

## 5. RetryableHttpClient锛堥噸璇曞皝瑁咃級

- [x] 5.1 鍒涘缓 `service/RetryableHttpClient.java`锛坄callApiWithRetry(url, method, headers, body, retryMax, timeoutMs, auditMode, auditContext)` 鏂规硶锛?
- [x] 5.2 閫€閬垮熀鏁板啓姝?500ms锛屾寚鏁?`Thread.sleep(500 * (1L << attempt))`锛沗attempt` 浠?0 鍒?`retryMax`锛沗retryMax=0` 鏃朵粎 1 娆′笉閲嶈瘯
- [x] 5.3 澶嶇敤 `ApiProxyService.callApi(url, method, headers, body, mode, timeoutMs)`锛?*涓嶅紩鍏ユ柊 HTTP 瀹㈡埛绔?*锛涙部鐢ㄧ幇鏈?`RestTemplate` 閰嶇疆锛?
- [x] 5.4 `InterruptedException` 鏃?`Thread.currentThread().interrupt()` 骞惰烦鍑哄惊鐜?

## 6. ExternalResponseFormatter锛堝搷搴旀牸寮忓鐞嗭級

- [x] 6.1 鍒涘缓 `service/ExternalResponseFormatter.java`锛坄format(ResponseEntity<String> resp, String responseFormat)` 闈欐€佹柟娉曪級
- [x] 6.2 `responseFormat="json"` 鈫?`objectMapper.readValue(resp.getBody(), Object.class)` 杩斿洖缁撴瀯鍖栧璞?
- [x] 6.3 `responseFormat="text"` 鈫?鐩存帴杩斿洖 `resp.getBody()` 瀛楃涓?
- [x] 6.4 `responseFormat="binary-base64"` 鈫?`Base64.getEncoder().encodeToString(resp.getBody().getBytes(StandardCharsets.UTF_8))`

## 7. ExternalOutboundPayloadMasker锛堝璁¤劚鏁忥級

- [x] 7.1 鍒涘缓 `audit/ExternalOutboundPayloadMasker.java`锛坄mask(Map<String,Object> llmParams, List<ExternalServiceInput> inputs)` 鏂规硶锛?
- [x] 7.2 閬嶅巻瀛愯〃琛岋細鑻?`is_sensitive=1` 鍒欏皢鍊兼浛鎹负 `"***MASKED***"`锛涜嫢 `is_sensitive=0` 鍒欎繚鐣欏師鍊?
- [x] 7.3 閬嶅巻 llmParams 涓?*涓嶅湪瀛愯〃**鐨?key锛氫繚鐣欏師鍊硷紙钀藉璁℃椂鍙湅鍒?LLM 璇紶锛?
- [x] 7.4 杩斿洖鐨?Map 椤哄簭锛歚鍏堝瓙琛ㄨ锛堟寜 display_order锛夛紝鍐?LLM 棰濆 key`

## 8. ExternalServiceSkillExecutor锛堟牳蹇冨嚭绔欓€昏緫锛?

- [x] 8.1 鍒涘缓 `service/ExternalServiceSkillExecutor.java`锛坄@Service`锛沗executeExternalSkill(Skill skill, Map<String,Object> config, Object parameters, String userId)` 鏂规硶锛?
- [x] 8.2 瀹炵幇 搂8.1 浼唬鐮侊紙宸茶璁″畬鏁达級锛?
  1. `config.get("serviceName")` 鈫?`registry.getByNameOrThrow()` 鈫?妫€鏌?`enabled=1`
  2. `registry.listInputs(svc.getId())` 鎷垮瓙琛ㄨ
  3. 蹇呭～鏍￠獙锛氶亶鍘嗗瓙琛?`is_required=1` 鐨勮锛屾鏌?`llmParams` 鏄惁鍚?`external_param_name`
  4. path 鏇挎崲锛歚endpoint_url.replace("{" + name + "}", URLEncoder.encode(value, "UTF-8"))`锛堟垨 raw 妯″紡涓嶇紪鐮侊級
  5. 鎷?query / body / header锛堟寜 `param_location` 杩囨护锛沗is_raw_transmission` 鍐冲畾缂栫爜鏂瑰紡锛?
  6. 璁よ瘉娉ㄥ叆锛歚AuthConfigParser` + switch 鎸?`auth_kind`
  7. 瀹¤鑴辨晱锛歚masker.mask()`
  8. 璋冪敤锛歚retryableHttpClient.callApiWithRetry(...)`
  9. 鍝嶅簲澶勭悊锛歚responseFormatter.format()` 鈫?杩斿洖 LLM
- [x] 8.3 浜岃繘鍒?body锛坄body_content_type=binary`锛夛細璋?`FileRefResolver.resolve(fileRef)` 鈫?`FileToolService.readInputStream(userFile)` 鈫?鐢?`RestTemplate` + `MultipartFile` 鎷?multipart
- [x] 8.4 閾捐矾杩借釜閫忎紶锛氭敞鍏?`X-Trace-Id` / `X-Request-Id` / `X-User-Id` / `X-Session-Id` 鍒?`headerMap`锛堜粠鍏ョ珯涓婁笅鏂?`RequestContextHolder` 鎴栧弬鏁?`userId` 鎷匡級

## 9. SkillExecutionService switch 鎺ュ叆

- [x] 9.1 鍦?`backend/skill-gateway/src/main/java/.../service/SkillExecutionService.java` 鐨?`execute()` switch 涓拷鍔?`case "external": return externalServiceSkillExecutor.executeExternalSkill(skill, config, parameters, userId);`
- [x] 9.2 鍦?`SkillExecutionService` 娉ㄥ叆 `ExternalServiceSkillExecutor`锛堟瀯閫犲櫒娉ㄥ叆 + `@Autowired` 鎴?`@RequiredArgsConstructor`锛?

## 10. SystemSkillController.buildExternalConfigSchema

- [x] 10.1 鍦?`backend/skill-gateway/src/main/java/.../controller/SystemSkillController.java` 鐨?`listExecutionTypes()` 涓拷鍔?`external` 寰幆锛歚for (ExternalService svc : registry.listEnabled()) { types.add(buildExternalConfigSchema(svc)); }`
- [x] 10.2 鏂板 `private JsonNode buildExternalConfigSchema(ExternalService svc)` 鏂规硶锛宻chema 鍙惈 2 涓敭锛?
  - `serviceName`锛歚ui: 'select'`锛宱ptions = 宸插惎鐢ㄦ湇鍔″悕鍒楄〃
  - `interfaceDescription`锛歚ui: 'textarea'`
- [x] 10.3 `additionalProperties: false`锛坰chema 寮哄埗鎷掔粷 `inputs` / `mapsTo` / `operation` 鏃у瓧娈碉級
- [x] 10.4 鍦?`SystemSkillController` 娉ㄥ叆 `ExternalServiceRegistry`

## 11. SkillService FK 鏍￠獙 + 鏃у瓧娈垫嫆缁?

- [x] 11.1 鍦?`backend/skill-gateway/src/main/java/.../service/SkillService.java` 鐨?`createOrUpdate()` 涓紝瀵?`kind=external` 鐨?skill 鍔?`registry.assertExists(skill.configuration.serviceName)` 鏍￠獙
- [x] 11.2 鏍￠獙澶辫触鎶?`IllegalArgumentException`锛堝甫鍙娑堟伅锛氭湇鍔′笉瀛樺湪 / 鏈嶅姟绂佺敤 / serviceName 缂哄け锛?
- [x] 11.3 鍦?`JsonSchemaValidator` 涓 `kind=external` 鐨?skill 鏍￠獙 `configuration`锛?*鍙厑璁?* `kind` / `serviceName` / `interfaceDescription` 涓変釜閿紱**鎷掔粷** `inputs` / `mapsTo` / `operation`锛堢敤 `additionalProperties: false`锛?
- [x] 11.4 鏍￠獙澶辫触杩斿洖 400 + 閿欒娑堟伅

## 11.5 Skill.computeSchemaPropertiesInternal() 娲剧敓 external schemaProperties锛坅gent-core 0 鏀瑰姩鏈哄埗锛?

> 瀵瑰簲 `design.md 鍐崇瓥 11` + `specs/external-service-skill/spec.md Requirement: External skill runtime exposure to LLM`銆傛湰鑺傛槸 **agent-core 0 鏀瑰姩** 鐨勬牳蹇冨疄鐜拌矾寰勶紝**鎵€鏈夋敼鍔?*闆嗕腑鍦?Gateway `Skill.java` 鍗曠偣銆?

### 11.5.1 淇敼 Skill.computeSchemaPropertiesInternal() 鏂板 kind=external 鍒嗘敮

- [x] 11.5.1.1 鍦?`backend/skill-gateway/src/main/java/.../entity/Skill.java` 鐨?`computeSchemaPropertiesInternal(String config)` 鏂规硶鏈熬鏂板 `else if ("external".equals(kind))` 鍒嗘敮
- [x] 11.5.1.2 璇ュ垎鏀?*涓?*鐩存帴璋?`ExternalServiceRegistry`锛堥伩鍏?entity 闈欐€佹柟娉曚緷璧?Spring bean锛夛紱鏀逛负锛氳繑鍥炵┖ Map锛岀敱 `SkillService.createOrUpdate()` 鍦ㄦ寔涔呭寲鍓嶈皟 `externalServiceSkillExecutor.deriveSchemaProperties(skill)` 琛ュ叏 鈫?鍐欏洖 `skill.setSchemaProperties(...)` 鍚庡啀 save
- [x] 11.5.1.3 鎴栭噰鐢ㄦ浛浠ｆ柟妗堬細鍦?`Skill.java::computeSchemaPropertiesInternal()` 涓?*浠?*璇嗗埆 `kind=external` 杩斿洖 null 鍝ㄥ叺鍊硷紝鐢?`SkillService` 妫€娴嬪悗璋?`ExternalServiceSkillExecutor.deriveSchemaProperties(...)` 娉ㄥ叆锛?*鎺ㄨ崘鏂规**锛宔ntity 淇濇寔绾噣锛?
- [x] 11.5.1.4 娲剧敓閫昏緫锛?
  ```
  1. cfg = parseJSON(configuration)
  2. kind = cfg.get("kind")
  3. serviceName = cfg.get("serviceName")
  4. svc = externalServiceRegistry.getByNameOrThrow(serviceName)  // 瑙﹀彂 FK 鏍￠獙
  5. inputs = externalServiceRegistry.listInputs(svc.getId())       // 鎸?display_order ASC, id ASC
  6. properties = new LinkedHashMap<>()
     for input in inputs:
       properties.put(input.externalParamName, {
         "type": input.paramType,                    // "string"/"number"/"boolean"
         "description": input.description != null ? input.description : input.displayName
       })
  7. required = inputs.filter(i => i.isRequired == 1).map(i => i.externalParamName)
  8. return { properties, required }
  ```
- [x] 11.5.1.5 鍦?`SkillService.createOrUpdate()` 璺緞涓細
  - 鍏堣皟 `Skill.computeSchemaPropertiesInternal(config)` 鎷垮埌鍒濆 schemaProperties
  - 鑻?kind=external 涓旂粨鏋滄槸绌?null 鈫?璋?`externalServiceSkillExecutor.deriveSchemaProperties(skill)` 琛ュ叏 鈫?merge
  - 鍐欏洖 `skill.setSchemaProperties(...)` 鍐嶆寔涔呭寲
  - 杩欎繚璇?`computeSchemaPropertiesInternal()` 鐜版湁閫昏緫锛坅pi/python SSH template锛?*涓嶈鐮村潖**
- [x] 11.5.1.6 娲剧敓鏃?*涓ユ牸鎸?display_order ASC, id ASC** 鎺掑簭锛堜笌 LLM 宸ュ叿 schema 涓€鑷达紱搂20 鍙傛暟鍚嶄竴鑷存€э級

### 11.5.2 ExternalServiceSkillExecutor 鏂板 deriveSchemaProperties() 鏂规硶

- [x] 11.5.2.1 鍦?`ExternalServiceSkillExecutor` 鏂板 `public Map<String, Object> deriveSchemaProperties(Skill skill)` 鏂规硶
- [x] 11.5.2.2 鏂规硶瀹炵幇锛氳В鏋?`skill.configuration` 鈫?鎷?serviceName 鈫?璋?registry 鎷垮瓙琛ㄨ 鈫?娲剧敓 `properties` + `required`
- [x] 11.5.2.3 serviceName 涓嶅瓨鍦?鈫?鎶?`IllegalArgumentException("External service not found: " + serviceName)`锛堜笌 FK 鏍￠獙鍏辩敤閿欒娑堟伅锛?
- [x] 11.5.2.4 serviceName 绂佺敤 鈫?鎶?`IllegalArgumentException("External service disabled: " + serviceName)`锛堜笌鎵ц鏃跺叡鐢ㄩ敊璇秷鎭級
- [x] 11.5.2.5 瀛愯〃涓虹┖ 鈫?杩斿洖 `{properties: {}, required: []}`锛?*涓?*鎶涘紓甯革紝涓庡喅绛?10 涓€鑷达級

### 11.5.3 agent-core 0 鏀瑰姩楠岃瘉

- [x] 11.5.3.1 瀹炴柦瀹屾垚鍚庤窇 `git diff backend/agent-core/` 搴斾负绌猴紙**闆舵枃浠朵慨鏀?*锛?
- [x] 11.5.3.2 `cd backend/agent-core && npm run build` 浠嶉€氳繃锛?*鏈Е鍙?* 閲嶆柊缂栬瘧 agent-core锛?
- [x] 11.5.3.3 绔埌绔祴璇曪細admin 鍒涘缓 external skill 鈫?agent-core 鍚姩 鈫?`loadGatewayExtendedTools()` 璋?`/api/skills` 鈫?鎷垮埌 `schemaProperties` 鈫?`buildSkillZodSchema()` 娲剧敓 Zod 鈫?LLM 鐪嬪埌 tool schema property 鍚嶄负 `q` / `units` / `lang`
- [x] 11.5.3.4 绔埌绔祴璇曪細LLM 璋冪敤 tool锛宲ayload key 鏄?`q` / `units` / `lang` 鈫?agent-core 鍘熸牱 POST Gateway 鈫?Gateway switch 杩?`case "external"` 鈫?ExternalServiceSkillExecutor 鏌ュ瓙琛?鈫?鎷煎嚭绔?鈫?鍝嶅簲鍥?LLM
- [x] 11.5.3.5 楠岃瘉 `Skill.java::computeSchemaPropertiesInternal()` 鐜版湁 case锛坅pi/python锛夐€昏緫**鏈鐮村潖**锛氱幇鏈?skill 鐨?schemaProperties 浠嶆纭敓鎴?

### 11.5.4 涓?api/python 鐨勫绛夋€у洖褰掗獙璇?

- [x] 11.5.4.1 admin 鍒涘缓 `kind=api` skill锛屽弬鏁颁粠 `parameterContract` 娲剧敓 schemaProperties 鈫?agent-core 璧板悓涓€璺緞 鈫?宸ュ叿璋冪敤鎴愬姛锛堝洖褰掑師鏈夐摼璺級
- [x] 11.5.4.2 admin 鍒涘缓 `kind=python` skill锛屽弬鏁颁粠 `parameterContract` 娲剧敓 schemaProperties 鈫?agent-core 璧板悓涓€璺緞 鈫?娌欑鎵ц鎴愬姛锛堝洖褰掑師鏈夐摼璺級
- [x] 11.5.4.3 admin 鍒涘缓 `kind=template` skill锛屽弬鏁颁粠閰嶇疆娲剧敓 鈫?agent-core 璧板悓涓€璺緞锛堝洖褰掑師鏈夐摼璺級
- [x] 11.5.4.4 admin 鍒涘缓 `kind=external` skill锛屽弬鏁颁粠 `external_service_input` 娲剧敓 鈫?agent-core 璧板悓涓€璺緞锛堟柊閾捐矾锛?
- [x] 11.5.4.5 4 绉?kind 鍦?agent-core 绔?*璧板畬鍏ㄧ浉鍚?*鐨?`buildSkillZodSchema(config, schemaProperties)` 璺緞 鈫?璇佹槑 0 鏀瑰姩

## 12. ExternalServiceController锛坅dmin CRUD锛?

- [x] 12.1 鍒涘缓 `controller/ExternalServiceController.java`锛坄@RestController` `@RequestMapping("/api/external-service")`锛涙墍鏈夊啓鎺ュ彛 `@PreAuthorize("hasRole('ADMIN')")`锛?
- [x] 12.2 瀹炵幇 8 涓鐐癸紙鍙傝€?`external-service-registry/spec.md` Requirement: Admin CRUD for external_service锛夛細
  - `GET /api/external-service` 鈥?list锛坅dmin-only锛?
  - `GET /api/external-service/{id}` 鈥?get by id锛坅dmin-only锛?
  - `GET /api/external-service/by-name/{name}` 鈥?get by name锛坅dmin-only锛?
  - `POST /api/external-service` 鈥?create锛坅dmin-only锛涘惈瀛愯〃琛岋紱浜嬪姟锛?
  - `PUT /api/external-service/{id}` 鈥?update锛坅dmin-only锛涘惈瀛愯〃琛屾浛鎹紱浜嬪姟锛?
  - `DELETE /api/external-service/{id}` 鈥?delete锛坅dmin-only锛汣ASCADE 瀛愯〃琛岋紱浜嬪姟锛?
  - `POST /api/external-service/{id}/invalidate-cache` 鈥?澶辨晥鍗曟湇鍔＄紦瀛?
  - `POST /api/external-service/invalidate-cache` 鈥?澶辨晥鎵€鏈夌紦瀛?
- [x] 12.3 鍦?`create` / `update` 璺緞涓細鑻?`auth_config.valueStatic` 鏄槑鏂囷紝**鍏?`AesCipher.encrypt()` 鍐嶅瓨**锛堝厹搴曞姞瀵嗭紱admin UI 宸插姞瀵嗘椂 no-op锛?
- [x] 12.4 鍦?`read` 璺緞涓細`ExternalServiceView` 瀵归潪 admin role 闅愯棌 `valueStatic`锛堣繑鍥?`***MASKED-XXXX***`锛?
- [x] 12.5 鍒涘缓 `controller/ExternalServiceQueryController.java`锛坄GET /api/external-service/{name}/inputs` 鍏紑绔偣锛涗换浣曞凡璁よ瘉鐢ㄦ埛鍙锛涜繑鍥炲瓙琛ㄨ鎺掗櫎 `is_sensitive`锛?

## 13. 鍓嶇 skillEditor.ts 鎵╁睍

- [x] 13.1 鍦?`frontend/src/utils/skillEditor.ts` 鐨?`ConfigKind` union 鍔?`'external'`
- [x] 13.2 鏂板 `ExternalConfigDraft` 鎺ュ彛锛?*鍙惈 `serviceName` + `interfaceDescription` 涓や釜瀛楁**锛?
- [x] 13.3 鏂板 `parseExternalDraft(config)` / `serializeExternalDraft(draft)` / `isExternalDraft(draft)` 鍑芥暟
- [x] 13.4 鏂板 `EXTERNAL_ALLOWED_KEYS = ['serviceName', 'interfaceDescription']` 甯搁噺
- [x] 13.5 `createDefaultSkillDraft('CONFIG', 'external')` 榛樿鍊硷紙`serviceName: ''`锛宍interfaceDescription: ''`锛?
- [x] 13.6 `CONFIG_KIND_LABELS.external = '澶栭儴 HTTP 鏈嶅姟'`
- [x] 13.7 `parseSkillDraft` / `serializeSkillDraft` switch 鍔?`case 'external'`
- [x] 13.8 `getConfigKindOptions()` / `getPresetLabel()` 鍔?`external` 鍒嗘敮
- [x] 13.9 鑷煡锛氭墍鏈夋柊鍔犵殑 export / const / function 蹇呴』鍦ㄦ枃浠跺唴琚紩鐢紙閬垮厤 TS6133锛?

## 14. 鍓嶇 SkillManagementModal.vue 鎵╁睍

- [x] 14.1 鍦?`frontend/src/components/SkillManagementModal.vue` 鐨?`draftToFormValues` / `updateDraftFromFormValues` 鍔?`isExternalDraft` 鍒嗘敮锛?*鍙鐞?`serviceName` + `interfaceDescription`**锛?
- [x] 14.2 `serviceName` change 鏃惰皟 `GET /api/external-service/{name}/inputs` 鎷垮瓙琛ㄨ 鈫?娓叉煋**鍙棰勮鍖?*锛堜笉鍐欏叆 configuration锛?
- [x] 14.3 棰勮鍖烘寜 `display_order` 娓叉煋锛氭瘡琛?= `[display_name 涓枃 label] (external_param_name 鑻辨枃) [textarea 棰勮]`
- [x] 14.4 淇濆瓨鍓?*涓?*澶嶅埗瀛愯〃琛屽埌 draft锛涗繚瀛樻椂鍙紶 `kind` / `serviceName` / `interfaceDescription` 涓変釜閿?

## 15. 鍓嶇 ConfigFormRenderer.vue 楠岃瘉

- [x] 15.1 楠岃瘉 `ConfigFormRenderer.vue` 宸叉敮鎸?`ui: 'select'` / `ui: 'textarea'` / `ui: 'input'`锛堢敤浜?`serviceName` select / `interfaceDescription` textarea锛?
- [x] 15.2 **涓?*瀹炵幇 `ui: 'dynamicList'`锛堟湰璁捐鏃?inputs[] 鍔ㄦ€佽〃鍗曢渶姹傦級
- [x] 15.3 **涓?*鏂板浠讳綍 `.vue` 鏂囦欢

## 16. 鑷煡涓庢枃妗?

- [x] 16.1 鍓嶇 `cd frontend && npx vue-tsc -b` 闈欓粯閫氳繃锛堥浂 TS6133锛?
- [x] 16.2 鍓嶇 `cd frontend && npm run build` 閫€鍑虹爜 0
- [x] 16.3 鍚庣 `cd backend/skill-gateway && ./apache-maven-3.8.5/bin/mvn -s ./settings.xml -DskipTests compile` 閫氳繃锛圝DK 1.8 缂栬瘧锛汚GENTS.md 搂2.4 鍚姩 mvn 蹇呴』鍏?cd 鍒?skill-gateway锛?
- [x] 16.4 鍚庣 `java -cp ... AesCipher encrypt "sk-xxx"` 楠岃瘉鍔犲瘑宸ュ叿鍙敤
- [x] 16.5 鍐峰惎鍔ㄩ獙璇侊細娓呯┖ DB 鈫?鍚姩 gateway 鈫?`SHOW TABLES LIKE 'external_service%'` 纭 2 寮犺〃鑷姩鍒涘缓
- [x] 16.6 鎵嬪伐璺?`docs/external-service-skill-design.md 搂9` 瀹屾暣娴佺▼绀轰緥锛坅dmin 閰?weather service + 3 琛?input 鈫?鍒涘缓 External Skill 鈫?Skill 鍒涘缓椤佃嚜鍔ㄦ覆鏌?3 涓?textarea 鈫?LLM 璋冪敤 鈫?鍑虹珯 query 鏍￠獙锛?
- [x] 16.7 楠岃瘉 is_raw_transmission 涓ょ鍊硷紙澶╂皵 q is_raw=0 / 鑴氭湰 code is_raw=1锛夌殑鍑虹珯 payload 宸紓
- [x] 16.8 楠岃瘉 admin 鏀瑰瓙琛紙鍔?q2 琛岋級鍚庝笟鍔℃柟 Skill 绔嬪嵆鐢熸晥锛堟棤闇€閲嶄繚瀛橈級
- [x] 16.9 琛?`api_call_log` 娴嬭瘯鐢ㄤ緥锛堥獙璇?sensitive mask / LLM 璇紶 key 涔熻惤瀹¤锛?
- [x] 16.10 纭 `openspec/reviews/2026-06-23-add-external-service-skill.md` 鏄熀浜庢棫璁捐锛坄inputs[]` / `dynamicList` / `auth_value_static`锛夌殑 review锛?*涓庢湰娆?change 涓嶅啿绐?*锛涗粎浣滃巻鍙插弬鑰?

## 17. 鏂囨。鍚屾

- [x] 17.1 纭鏈€缁堣璁＄ `docs/external-service-skill-design.md` 瀛樺湪涓斿唴瀹规渶鏂帮紙涓庢湰娆?OpenSpec 涓€鑷达級
- [x] 17.2 鍦?`backend/skill-gateway/src/main/resources/schema-mysql.sql` 澶撮儴娉ㄩ噴閲屾敞鏄?鍙傝€?`openspec/changes/add-external-service-skill/` 璁捐绋?

## 18. 閮ㄧ讲涓庡啋鐑?

- [x] 18.1 閮ㄧ讲鍒版祴璇曠幆澧冿紙`bxdc-mysql` 瀹瑰櫒 + 3 鏈嶅姟锛?
- [x] 18.2 admin 褰曞叆绀轰緥鏁版嵁锛堝弬鑰?`docs/external-service-skill-design.md 搂4.7` 4 涓満鏅殑 INSERT 渚嬪瓙锛?
- [x] 18.3 楠岃瘉 GET `/api/external-service` 鍒楄〃锛坅dmin 瑙掕壊锛?
- [x] 18.4 楠岃瘉 GET `/api/external-service/weather-openweathermap/inputs` 鍏紑璇伙紙浠讳綍宸茶璇佺敤鎴凤級
- [x] 18.5 楠岃瘉鍒涘缓 kind=external Skill锛堝彧濉?serviceName + interfaceDescription锛?
- [x] 18.6 楠岃瘉 Skill 鍒涘缓椤佃嚜鍔ㄦ覆鏌?3 涓?textarea锛坬 / units / lang锛?
- [x] 18.7 楠岃瘉 LLM 璋冪敤 Skill 鈫?Gateway 鍑虹珯鍒?OpenWeatherMap 鈫?鍝嶅簲鍥?LLM
- [x] 18.8 楠岃瘉 dynamicToken 妯″紡锛堝甫 cacheSeconds 缂撳瓨锛?
- [x] 18.9 楠岃瘉 is_raw_transmission=1 瀛楁锛堣剼鏈墽琛?/ 椋炰功 content锛夊師鏂囬€忎紶
- [x] 18.10 楠岃瘉 disabled 鏈嶅姟鎵ц鏃惰繑鍥?400

## 19. 绌烘暟鎹満鏅厹搴曪紙寮虹害鏉燂紝鍘熸湁 Skill 閾捐矾闆跺洖褰掞級

> 瀵瑰簲 `docs/external-service-skill-design.md 搂17` + `design.md 鍐崇瓥 10`銆傛湰鑺傛槸**鏂板姛鑳藉畬鍏?opt-in**鐨勫己淇濊瘉锛? 寮犳柊琛ㄤ负绌烘椂锛屽師鏈?6 绉?Skill 閾捐矾琛屼负**瀹屽叏涓嶅彉**銆?

### 19.1 鍚庣鍐峰惎鍔ㄥ厹搴?

- [x] 19.1.1 `ExternalServiceRegistry.loadAll()` 鐢?try/catch 鍖呰９锛涗换浣?DB 寮傚父浠?`log.warn`锛?*涓嶆姏銆佷笉闃诲 Spring 鍚姩**锛堜笌 `PythonSandboxService` 鍚姩妯″紡涓€鑷达級
- [x] 19.1.2 `loadAll()` 澶辫触鏃?map 淇濇寔绌猴紱鍚庣画 `listEnabled()` 杩斿洖 `Collections.emptyList()`锛?*缁濅笉杩斿洖 null**锛?
- [x] 19.1.3 5 鍒嗛挓 TTL 鍚庡彴绾跨▼鍚屾牱鍖?try/catch锛涘け璐ヤ粎 warn锛屼笉褰卞搷涓绘祦绋?
- [x] 19.1.4 `listEnabled()` / `listInputs()` 闃插尽鎬?null check锛歮apper 杩斿洖 null 鏃惰浆涓?`Collections.emptyList()`
- [x] 19.1.5 `assertExists(serviceName)`锛氭湇鍔℃湭娉ㄥ唽鏃舵姏 `IllegalArgumentException`锛?*浠?*瀵?`kind=external` 瑙﹀彂锛夛紝鍏朵粬 kind 涓嶅彈褰卞搷

### 19.2 Schema 鍒楄〃鍔犺浇鍏滃簳

- [x] 19.2.1 `SystemSkillController.listExecutionTypes()` 鍘?4 绉嶇被鍨嬶紙api / ssh / template / python锛夐€昏緫**瀹屽叏淇濈暀**
- [x] 19.2.2 鏂板 `for (ExternalService svc : registry.listEnabled())` 寰幆锛氱┖闆嗗悎 鈫?0 娆″惊鐜?鈫?涓嶆寕浠讳綍 external 椤?
- [x] 19.2.3 `registry` bean 娉ㄥ叆鍔?null 闃插尽锛坄if (registry != null)`锛夛紝閬垮厤 bean 寰幆 / 鏈敞鍏ュ鑷?NPE
- [x] 19.2.4 `buildExternalConfigSchema()` 浠呭湪寰幆鍐呰璋冪敤锛屼笉褰卞搷鍘熸柟娉曠鍚?

### 19.3 FK 鏍￠獙鍏滃簳

- [x] 19.3.1 `SkillService.createOrUpdate()` 涓?FK 鏍￠獙鐢?`if ("external".equals(kind))` 鍖呰９
- [x] 19.3.2 鍏朵粬 kind锛坅pi / ssh / python / template锛夌殑 `createOrUpdate()` 璺緞**闆朵慨鏀?*
- [x] 19.3.3 `IllegalArgumentException` 鐢?controller 鍏滃簳杞?400锛岄敊璇秷鎭彲璇?
- [x] 19.3.4 涓氬姟鏂瑰垱寤?`kind=external` Skill锛坰erviceName 鏈敞鍐岋級鈫?400 "External service not found: {name}"

### 19.4 Switch 璺敱鍏滃簳

- [x] 19.4.1 `SkillExecutionService.execute()` switch 鍘?4 涓?case锛坅pi / ssh / python / template锛?*闆朵慨鏀?*
- [x] 19.4.2 鏂板 `case "external":` 鍗曠嫭 import `ExternalServiceSkillExecutor`锛屽叆鍙?1 琛屽鎵?
- [x] 19.4.3 `ExternalServiceSkillExecutor` 鏄嫭绔?`@Service` 绫伙紝bean 涓嶅彲鐢ㄦ椂**鍙?*褰卞搷 external 璋冪敤锛屽叾浠?case 涓嶅彈褰卞搷
- [x] 19.4.4 涓氬姟鏂硅皟鐢ㄦ棦鏈?`kind=api` Skill 鈫?璧板師 `executeApiSkill()` 璺緞锛?*涓嶈Е鍙?* `ExternalServiceSkillExecutor`

### 19.5 杩愯鏃跺瓙琛ㄤ负绌哄厹搴?

- [x] 19.5.1 `ExternalServiceSkillExecutor.executeExternalSkill()` 鍏ュ彛瀵?`inputs` / `llmParams` 鍔?null 闃插尽锛坄Collections.emptyList()` / `Collections.emptyMap()`锛?
- [x] 19.5.2 蹇呭～鏍￠獙寰幆锛氱┖ inputs 鈫?0 娆″惊鐜?鈫?鐩存帴閫氳繃
- [x] 19.5.3 鍑虹珯 map 鍒濆鍖栵細`queryMap` / `bodyMap` / `headerMap` 涓虹┖ `LinkedHashMap`
- [x] 19.5.4 鎷艰寰幆锛氱┖ inputs 鈫?0 娆″惊鐜?鈫?map 淇濇寔绌?
- [x] 19.5.5 璁よ瘉娉ㄥ叆 `injectAuth(svc, headerMap)` **涓庡瓙琛ㄦ棤鍏?*锛屾寜涓昏〃鎵ц锛涘瓙琛ㄤ负绌烘椂浠嶇敓鏁?
- [x] 19.5.6 鍑虹珯璋冪敤锛歚callApi()` 鍗充究鎵€鏈?map 涓虹┖涔熻兘姝ｅ父璋冿紙POST 绌?body / GET 鏃?query 閮藉悎娉曪級
- [x] 19.5.7 涓氬姟鏂瑰紩鐢ㄥ凡娉ㄥ唽鏈嶅姟浣嗗瓙琛ㄧ┖ 鈫?Skill 鍒涘缓鎴愬姛 鈫?LLM 璋冪敤鏃?*姝ｅ父鍑虹珯**锛堜粎璁よ瘉 + 闈欐€?URL锛?

### 19.6 瀹¤鑴辨晱鍏滃簳

- [x] 19.6.1 `ExternalOutboundPayloadMasker.mask()` 鍏ュ彛瀵?`llmParams` / `inputs` 鍔?null 闃插尽
- [x] 19.6.2 绌?inputs 鈫?绌?`sensitiveKeys` 鈫?0 娆℃浛鎹?鈫?鎵€鏈?llmParams 鍘熸牱淇濈暀
- [x] 19.6.3 棰濆 LLM key锛堝瓙琛ㄦ病杩欒锛変篃淇濈暀锛堟寜 spec 搂Audit log masking锛?

### 19.7 鍏紑璇绘帴鍙ｅ厹搴?

- [x] 19.7.1 `GET /api/external-service/{name}/inputs`锛氭湇鍔′笉瀛樺湪 鈫?404锛坄IllegalArgumentException` 鈫?404锛?
- [x] 19.7.2 鏈嶅姟瀛樺湪浣嗗瓙琛ㄧ┖ 鈫?杩斿洖 `[]`锛堜笉杩斿洖 null / 涓嶈繑鍥?404锛?
- [x] 19.7.3 鏈璇佺敤鎴?鈫?401锛堟部鐢ㄧ幇鏈夊畨鍏ㄨ繃婊ゅ櫒锛?

### 19.8 鍓嶇鍏滃簳

- [x] 19.8.1 `skillEditor.ts`锛歚ConfigKind` union 鍔?`'external'`锛沗CONFIG_KIND_LABELS.external = '澶栭儴 HTTP 鏈嶅姟'` 鍗充究娉ㄥ唽琛ㄤ负绌轰篃淇濈暀 label
- [x] 19.8.2 `SkillManagementModal.vue`锛歚externalOptions = ref([])` / `subTablePreview = ref([])` 鍒濆涓虹┖鏁扮粍锛?*涓嶆槸 null**锛?
- [x] 19.8.3 `serviceName` select锛歚:disabled="!externalOptions.length"`锛岀┖闆嗗悎鏃剁鐢?+ 鏄剧ず銆屾棤閫夐」銆?
- [x] 19.8.4 瀛愯〃棰勮鍖猴細`v-if="subTablePreview.length"`锛岀┖闆嗗悎鏃?*涓嶆覆鏌?*
- [x] 19.8.5 `serviceName` change watch锛氭媺瀛愯〃澶辫触鏃?`subTablePreview.value = []`锛?*涓嶉樆濉?* Skill 缂栬緫
- [x] 19.8.6 涓氬姟鏂归€?`kind=api` / `kind=python` 鏃?*瀹屽叏涓嶈蛋** external 鍒嗘敮
- [x] 19.8.7 `vue-tsc -b` 闈欓粯閫氳繃锛堥浂 TS6133锛?

### 19.9 绌烘暟鎹嚜妫€ checklist锛堝疄鏂藉悗蹇呰窇锛?

- [x] 19.9.1 鏂伴儴缃诧紙2 寮犺〃涓嶅瓨鍦級锛歚SchemaMigrationRunner` 鑷姩寤鸿〃鎴愬姛
- [x] 19.9.2 绌鸿〃鍚姩锛氭棩蹇楄緭鍑恒€孡oaded 0 services銆嶏紝鏃?NPE / 鏃?stacktrace
- [x] 19.9.3 `GET /api/external-service` 杩斿洖 `[]`锛坅dmin 瑙掕壊锛?
- [x] 19.9.4 `GET /api/external-service/nonexistent/inputs` 杩斿洖 404
- [x] 19.9.5 `GET /api/external-service/weather-openweathermap/inputs`锛堝瓙琛ㄧ┖锛夎繑鍥?`[]`
- [x] 19.9.6 涓氬姟鏂瑰垱寤?`kind=api` Skill锛氭垚鍔燂紝鍘熼摼璺笉鍙橈紙鏁版嵁搴撴彃鍏ユ甯革紝listExecutionTypes 涓嶅彉锛?
- [x] 19.9.7 涓氬姟鏂瑰垱寤?`kind=external` Skill锛坰erviceName 鏈敞鍐岋級锛?00 "External service not found"
- [x] 19.9.8 涓氬姟鏂瑰垱寤?`kind=external` Skill锛坰erviceName 宸叉敞鍐屼絾瀛愯〃绌猴級锛氭垚鍔燂紝杩愯鏃舵甯稿嚭绔?
- [x] 19.9.9 LLM 璋冪敤 `kind=external` Skill锛堝瓙琛ㄧ┖锛夛細鍑虹珯 HTTP 璋冪敤鎴愬姛锛堜粎璁よ瘉 + 闈欐€?URL锛屾棤 query/body/header 鍙傛暟锛?
- [x] 19.9.10 涓氬姟鏂规墦寮€ Skill 鍒涘缓椤碉細UI 涓嶆樉绀?external 閫夐」锛堟敞鍐岃〃涓虹┖鏃讹級
- [x] 19.9.11 `vue-tsc -b` 闈欓粯閫氳繃锛堥浂 TS6133锛?
- [x] 19.9.12 `npm run build` 閫€鍑虹爜 0
- [x] 19.9.13 `mvn -DskipTests compile` 閫氳繃锛圝DK 1.8锛?

## 20. 鍙傛暟鍚嶄竴鑷存€х‖绾︽潫锛堝己绾︽潫锛宎dmin 閰嶇疆璐ｄ换锛?

> 瀵瑰簲 `docs/external-service-skill-design.md 搂17.6` + 鏂板 spec Requirement銆傚瓙琛?`external_param_name` **蹇呴』**涓庣涓夋柟 API 鏂囨。澹版槑鐨勫弬鏁板悕**瀛楃绾у畬鍏ㄤ竴鑷?*锛堝惈澶у皬鍐欍€佷笅鍒掔嚎銆佽繛瀛楃锛夈€侴ateway **涓嶅仛浠讳綍閲嶅懡鍚?/ 鏄犲皠 / 缈昏瘧**鈥斺€擫LM 宸ュ叿 schema property key = 瀛愯〃 `external_param_name` = 绗笁鏂?API 鍑虹珯 key锛屼笁鑰?*涓ユ牸鐩稿悓**銆?

### 20.1 Executor 閫忎紶锛堢粷涓嶉噸鍛藉悕锛?

- [x] 20.1.1 `ExternalServiceSkillExecutor` 鍑虹珯 key 鐩存帴璇?`inp.getExternalParamName()`锛?*涓嶅仛浠讳綍杞崲**
- [x] 20.1.2 query 鎷艰锛歚queryMap.put(inp.getExternalParamName(), value)`锛坘ey 鍘熸牱锛?
- [x] 20.1.3 body 鎷艰锛歚bodyMap.put(inp.getExternalParamName(), value)`锛坘ey 鍘熸牱锛孞ackson 搴忓垪鍖栦篃淇濈暀鍘?key锛?
- [x] 20.1.4 header 鎷艰锛歚headerMap.put(inp.getExternalParamName(), value)`锛坘ey 鍘熸牱锛屽ぇ灏忓啓淇濈暀锛?
- [x] 20.1.5 path 鏇挎崲锛歚endpoint_url.replace("{" + inp.getExternalParamName() + "}", value)`锛坘ey 鍘熸牱锛?
- [x] 20.1.6 浠ｇ爜 Review checklist锛氭墍鏈?outbound key 蹇呴』鏄?`external_param_name`锛屾棤 `toLowerCase` / `toCamelCase` / `replace("_", "")` 绛夎浆鎹?

### 20.2 鏃?mapsTo 鏈哄埗

- [x] 20.2.1 `JsonSchemaValidator` 鏍￠獙 `kind=external` skill configuration 鏃?*鎷掔粷**浠讳綍 `mapsTo` 瀛楁锛堜笌 `inputs[]` / `operation` 鍚屾牱鎷掔粷锛?
- [x] 20.2.2 `ExternalConfigDraft` / `parseExternalDraft` / `serializeExternalDraft` 涓嶅鍑?`mapsTo` 鐩稿叧瀛楁
- [x] 20.2.3 鍓嶇 Skill 鍒涘缓椤?*涓嶆覆鏌?*浠讳綍 mapsTo 杈撳叆鎺т欢

### 20.3 admin UI / SQL 閰嶇疆妫€鏌?

- [x] 20.3.1 admin UI `external_param_name` 瀛楁 label 鏄庣‘鍐欍€屾瀛楁蹇呴』涓庣涓夋柟 API 鏂囨。閲岀殑鍏ュ弬鍚嶅畬鍏ㄤ竴鑷淬€?
- [x] 20.3.2 admin UI 瀛楁 helper text 鎻愮ず銆屽弬鑰?[绗笁鏂?API 鏂囨。閾炬帴]锛屼緥濡?OpenWeatherMap 鏂囨。涓煄甯傚悕鍙傛暟鍚嶄负 `q`銆?
- [x] 20.3.3 SQL 褰曞叆娉ㄩ噴锛氭瘡涓?INSERT 璇彞闄勩€宍external_param_name` 蹇呴』涓庣涓夋柟 API 鏂囨。澹版槑鐨勫弬鏁板悕瀛楃绾у畬鍏ㄤ竴鑷淬€嶅娉?
- [x] 20.3.4 鎻愪緵 SQL 鑷鑴氭湰锛坄SELECT service_id, external_param_name FROM external_service_input WHERE service_id = ?`锛夛紝admin 鍙鐓ф枃妗ｆ鏌?

### 20.4 LLM 宸ュ叿 schema 涓€鑷存€?

- [x] 20.4.1 `SystemSkillController.buildExternalConfigSchema()`锛歓od schema property key = `external_param_name`锛堝瓧绗︾骇涓€鑷达級
- [x] 20.4.2 agent-core 閫忎紶鍚庯紝LLM 鐪嬪埌 tool schema property 鍚嶄负 `q` / `units` / `lang`锛堜笌瀛愯〃瀛楁瀹屽叏涓€鑷达級
- [x] 20.4.3 LLM 璋冪敤鏃?payload key 蹇呴』涓庡瓙琛ㄥ瓧娈典竴鑷达紱鑻ヤ笉涓€鑷?鈫?Gateway 涓嶅嚭绔欙紙鏃犲瓙琛ㄨ锛?+ audit 鏍囪銆孡LM 璇紶銆?

### 20.5 閰嶉敊琛屼负

- [x] 20.5.1 admin 閰嶉敊 `external_param_name`锛堜笌绗笁鏂?API 鏂囨。涓嶄竴鑷达級鈫?Gateway **涓嶅仛瀹㈡埛绔晶鑷姩淇**
- [x] 20.5.2 鍑虹珯 key 涓庣涓夋柟鏈熸湜涓嶇 鈫?绗笁鏂硅繑鍥?4xx
- [x] 20.5.3 Gateway 鎶婄涓夋柟 4xx 鍝嶅簲**閫忎紶**缁?LLM锛堜笉鎺╃洊銆佷笉閲嶈瘯鐚滄祴锛?
- [x] 20.5.4 audit log 璁板綍**瀹為檯**鍑虹珯 key锛堢敤浜?admin 鎺掓煡锛?
- [x] 20.5.5 admin 淇瀛愯〃锛堟棤闇€鏀?Skill锛屾棤闇€鏀?Gateway 浠ｇ爜锛夆啋 涓嬫璋冪敤鍗崇敓鏁堬紙鏈€闀?5 鍒嗛挓缂撳瓨杩囨湡锛?

### 20.6 鍙傛暟鍚嶄竴鑷存€ц嚜妫€ checklist

- [x] 20.6.1 weather service 瀛愯〃 `external_param_name = q / units / lang`锛堜笌 OpenWeatherMap 鏂囨。涓€鑷达級锛?*涓嶈兘**濉?`query` / `cityName`
- [x] 20.6.2 stock service 瀛愯〃 `external_param_name = list`锛堜笌鏂版氮 API 涓€鑷达級锛?*涓嶈兘**濉?`code` / `stockList`
- [x] 20.6.3 python service 瀛愯〃 `external_param_name = code / args / timeout`锛堜笌娌欑鍗忚涓€鑷达級
- [x] 20.6.4 feishu service 瀛愯〃 `external_param_name = msg_type / content / chat_id`锛堜笌椋炰功 webhook 涓€鑷达級
- [x] 20.6.5 LLM 宸ュ叿 schema property key 涓庡瓙琛?`external_param_name` **瀛楃绾у畬鍏ㄤ竴鑷?*
- [x] 20.6.6 鍑虹珯 HTTP query/body/header key 涓庡瓙琛?`external_param_name` **瀛楃绾у畬鍏ㄤ竴鑷?*
- [x] 20.6.7 鎶撳嚭绔欏寘锛圕harles / Wireshark / `api_call_log`锛変汉宸?spot check锛岀‘璁?key 涓庣涓夋柟 API 鏂囨。涓ユ牸鍖归厤
- [x] 20.6.8 閰嶉敊鏃讹紙admin 鐢ㄩ敊鍚嶅瓧锛夆啋 绗笁鏂硅繑鍥?4xx 鈫?Gateway 閫忎紶閿欒缁?LLM 鈫?admin 淇瀛愯〃
- [x] 20.6.9 澶у皬鍐欐晱鎰燂細`Content-Type` 鈮?`content-type` 鈮?`Content-type`
- [x] 20.6.10 snake_case 淇濈暀锛歚user_id` 鈮?`userId` 鈮?`user-id`
- [x] 20.6.11 鏁板瓧 / 鐗规畩瀛楃淇濈暀锛歚q1` / `param-2` / `data.field` 鎸夊師鏍烽€忎紶
