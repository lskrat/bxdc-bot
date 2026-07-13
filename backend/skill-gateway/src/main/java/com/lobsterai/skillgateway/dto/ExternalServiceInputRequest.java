package com.lobsterai.skillgateway.dto;

/**
 * 子表行入参 DTO（admin 增改用）。
 */
public class ExternalServiceInputRequest {

    private String externalParamName;
    private String displayName;
    private Integer isRequired;
    private Integer isRawTransmission;
    private String paramLocation;
    private String bodyContentType;
    private String paramType;
    private Integer isSensitive;
    private String description;
    private Integer displayOrder;

    public String getExternalParamName() { return externalParamName; }
    public void setExternalParamName(String externalParamName) { this.externalParamName = externalParamName; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public Integer getIsRequired() { return isRequired; }
    public void setIsRequired(Integer isRequired) { this.isRequired = isRequired; }

    public Integer getIsRawTransmission() { return isRawTransmission; }
    public void setIsRawTransmission(Integer isRawTransmission) { this.isRawTransmission = isRawTransmission; }

    public String getParamLocation() { return paramLocation; }
    public void setParamLocation(String paramLocation) { this.paramLocation = paramLocation; }

    public String getBodyContentType() { return bodyContentType; }
    public void setBodyContentType(String bodyContentType) { this.bodyContentType = bodyContentType; }

    public String getParamType() { return paramType; }
    public void setParamType(String paramType) { this.paramType = paramType; }

    public Integer getIsSensitive() { return isSensitive; }
    public void setIsSensitive(Integer isSensitive) { this.isSensitive = isSensitive; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }
}