pipeline {
    agent any

    environment {
        DOCKER_CREDS = credentials('docker-hub-credentials')
        
        IMAGE_TAG = "${env.GIT_COMMIT[0..6]}"
        
        DOCKER_USER = "salmahossam12"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Images') {
            steps {
                sh """
                    docker build -t ${DOCKER_USER}/shopflow-auth-service:${IMAGE_TAG} ./auth-service
                    docker build -t ${DOCKER_USER}/shopflow-products-service:${IMAGE_TAG} ./products-service
                    docker build -t ${DOCKER_USER}/shopflow-orders-service:${IMAGE_TAG} ./orders-service
                """
            }
        }

        stage('Push Images') {
            steps {
                sh """
                    # login to Docker Hub using Jenkins credentials
                    echo ${DOCKER_CREDS_PSW} | docker login -u ${DOCKER_CREDS_USR} --password-stdin
                    
                    # push all 3 images
                    docker push ${DOCKER_USER}/shopflow-auth-service:${IMAGE_TAG}
                    docker push ${DOCKER_USER}/shopflow-products-service:${IMAGE_TAG}
                    docker push ${DOCKER_USER}/shopflow-orders-service:${IMAGE_TAG}
                """
            }
        }

        stage('Deploy') {
            steps {
                withCredentials([file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')]) {
                    sh """
                        export KUBECONFIG=${KUBECONFIG_FILE}
                        ansible-playbook ansible/deploy.yml \
                            -i ansible/inventory/hosts.ini \
                            --extra-vars "shopflow_image_tag=${IMAGE_TAG}" \
                            --extra-vars "docker_hub_username=${DOCKER_USER}"
                    """
                }
            }
        }
    }

    post {
        success {
            echo "Pipeline succeeded — ShopFlow deployed to K8s"
        }
        failure {
            echo "Pipeline failed — check logs above"
        }
        always {
            // clean up local Docker images to save disk space on Jenkins machine
            sh """
                docker rmi salmahossam12/shopflow-auth-service:${IMAGE_TAG} || true
                docker rmi salmahossam12/shopflow-products-service:${IMAGE_TAG} || true
                docker rmi salmahossam12/shopflow-orders-service:${IMAGE_TAG} || true
            """
        }
    }
}

