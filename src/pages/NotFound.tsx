import React from 'react';
import { Layout, Button } from '@/components';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/config';

/**
 * Not Found (404) page
 */
const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
        <h1 className="text-6xl font-museo font-bold text-black dark:text-white mb-4">
          404
        </h1>
        <p className="text-2xl text-gray-600 dark:text-gray-400 mb-2">
          Page Not Found
        </p>
        <p className="text-gray-600 dark:text-gray-400 mb-8 text-center max-w-md">
          Sorry, we couldn't find the page you're looking for. It might have been moved or deleted.
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => navigate(ROUTES.HOME)}
        >
          Go back to home
        </Button>
      </div>
    </Layout>
  );
};

export default NotFound;
