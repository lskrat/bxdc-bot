package com.lobsterai.skillgateway.repository;

import com.lobsterai.skillgateway.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    boolean existsByNickname(String nickname);
}
