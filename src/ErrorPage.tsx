import React from 'react';
import { useRouteError } from 'react-router-dom';


export function ErrorPage () {
  const error = useRouteError() as any;
  console.error(error);

  return <div id="error-page">
    <h1>Error</h1>
    <p>
      <i>{error.statusText || error.message}</i>
    </p>
  </div>;
}
