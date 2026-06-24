package com.lobsterai.skillgateway.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.lobsterai.skillgateway.entity.SysLabel;
import com.lobsterai.skillgateway.mapper.SysLabelMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class LabelService {

    private final SysLabelMapper labelMapper;

    public LabelService(SysLabelMapper labelMapper) {
        this.labelMapper = labelMapper;
    }

    public SysLabel createLabel(SysLabel label, String userId) {
        label.setDel(0);
        label.setUpdateBy(userId);
        label.setUpdateAt(LocalDateTime.now());
        labelMapper.insert(label);
        return label;
    }

    public SysLabel getLabelById(Long id) {
        return labelMapper.selectOne(new LambdaQueryWrapper<SysLabel>()
                .eq(SysLabel::getId, id)
                .eq(SysLabel::getDel, 0));
    }

    public IPage<SysLabel> listLabels(int page, int size) {
        Page<SysLabel> pageParam = new Page<>(page, size);
        return labelMapper.selectPage(pageParam, new LambdaQueryWrapper<SysLabel>()
                .eq(SysLabel::getDel, 0)
                .orderByDesc(SysLabel::getUpdateAt));
    }

    public SysLabel updateLabel(Long id, SysLabel labelDetails, String userId) {
        SysLabel existing = getLabelById(id);
        if (existing == null) {
            return null;
        }
        existing.setName(labelDetails.getName());
        existing.setType(labelDetails.getType());
        existing.setIntro(labelDetails.getIntro());
        existing.setUpdateBy(userId);
        existing.setUpdateAt(LocalDateTime.now());
        labelMapper.updateById(existing);
        return existing;
    }

    public boolean deleteLabel(Long id) {
        SysLabel label = getLabelById(id);
        if (label == null) {
            return false;
        }
        label.setDel(1);
        labelMapper.updateById(label);
        return true;
    }
}