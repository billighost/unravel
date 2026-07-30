import React from 'react';

interface StructuredDataProps {
  schema: Record<string, any>;
}

export default function StructuredData({ schema }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
