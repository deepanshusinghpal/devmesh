export function areDependenciesComplete(dependencies = []) {
  return dependencies.every(
    dependency => dependency.dependencyJob?.status === 'COMPLETED',
  )
}
