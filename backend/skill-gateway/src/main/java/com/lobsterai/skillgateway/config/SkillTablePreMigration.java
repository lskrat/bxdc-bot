package com.lobsterai.skillgateway.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Runs before Hibernate ddl-auto so adding NOT NULL columns (e.g. visibility) does not fail on H2
 * when copying existing rows. Removes all persisted extended skills ({@code type=EXTENSION}), including former
 * platform seeds; built-in capabilities are not stored in this table.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SkillTablePreMigration implements BeanPostProcessor {

    private static final Logger log = LoggerFactory.getLogger(SkillTablePreMigration.class);

    private static final String DELETE_ALL_EXTENSIONS = """
            DELETE FROM skills
            WHERE UPPER(COALESCE(TRIM(type), '')) = 'EXTENSION'
            """;

    private final DataSource dataSource;
    private volatile boolean done;

    public SkillTablePreMigration(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException {
        if (done || !(bean instanceof LocalContainerEntityManagerFactoryBean)) {
            return bean;
        }
        done = true;
        runCleanup();
        return bean;
    }

    private void runCleanup() {
        try (Connection c = dataSource.getConnection()) {
            if (!tableExists(c, "SKILLS")) {
                return;
            }
            try (Statement s = c.createStatement()) {
                int n = s.executeUpdate(DELETE_ALL_EXTENSIONS);
                if (n > 0) {
                    log.info("Removed {} extension skill row(s) before Hibernate schema update (built-in are UI-only).", n);
                }
            }
        } catch (SQLException e) {
            log.warn("Pre-Hibernate skill cleanup failed ({}). If schema migration fails on visibility, delete user extension rows or reset the H2 file.", e.getMessage());
        }
    }

    private static boolean tableExists(Connection c, String tableName) throws SQLException {
        DatabaseMetaData md = c.getMetaData();
        try (ResultSet rs = md.getTables(null, null, tableName, new String[] { "TABLE" })) {
            return rs.next();
        }
    }
}
